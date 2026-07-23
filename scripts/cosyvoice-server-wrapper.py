#!/usr/bin/env python
# scripts/cosyvoice-server-wrapper.py
#
# CosyVoice 官方 server.py 的启动包装器。
#
# 解决的问题（spk2info 服务端加载 gap）：
#   官方 server.py 启动时 AutoModel(model_dir) -> CosyVoice2.__init__ ->
#   CosyVoiceFrontEnd 只从 {model_dir}/spk2info.pt 单文件加载音色表，
#   不会扫描 docker-compose.cosyvoice.yml 挂载的 /opt/CosyVoice/spk2info 目录。
#   因此 build-cosyvoice-spk2info.mts 生成的 <spk_id>.pt 分文件不会被自动加载，
#   此前只能靠手工把音色注入 modelscope 缓存的 spk2info.pt 才可用，换机器即丢失。
#
# 本包装器的做法（不改官方源码、不污染 modelscope 缓存）：
#   1. monkey-patch cosyvoice.cli.cosyvoice.AutoModel 函数
#   2. 在原 AutoModel 返回模型实例后，扫描 /opt/CosyVoice/spk2info/*.pt
#   3. 逐个 torch.load 后 update 到 model.frontend.spk2info（dict）
#   4. 再 runpy 执行官方 server.py（透传 sys.argv，--port/--model_dir 正常解析）
#
# 挂载目录成为自定义音色的唯一真相源：放 <spk_id>.pt 即可用，随 data/ 迁移跨机器复用。
# 升级 cosyvoice:local 镜像时需复核 AutoModel 仍为函数、实例仍有 frontend.spk2info dict。

import glob
import os
import runpy
import sys

# 容器内 CosyVoice 代码根（与 docker-compose.cosyvoice.yml 的 working dir 对齐）
COSYVOICE_ROOT = '/opt/CosyVoice/CosyVoice'
# 自定义音色挂载目录（compose 只读挂载源 = <data>/cosyvoice-spk2info）
SPK2INFO_DIR = os.environ.get('COSYVOICE_SPK2INFO_DIR', '/opt/CosyVoice/spk2info')
# 官方 server.py 路径
SERVER_PY = '/opt/CosyVoice/CosyVoice/runtime/python/fastapi/server.py'

# server.py 自身靠 ROOT_DIR/../../.. 把 /opt/CosyVoice/CosyVoice 加入 sys.path，
# 但本包装器在 runpy 之前就要 import cosyvoice，必须自备 sys.path
sys.path.insert(0, COSYVOICE_ROOT)
sys.path.insert(0, os.path.join(COSYVOICE_ROOT, 'third_party/Matcha-TTS'))

# patch deepspeed：基础镜像（pytorch runtime）无 nvcc/CUDA_HOME，GPU 模式下 deepspeed
# import 时 installed_cuda_version() 会调 nvcc -V，FileNotFoundError 致容器崩溃循环。
# DS_BUILD_OPS=0 不编译 op，故绕过版本探测：让 installed_cuda_version 直接返回 torch 的
# CUDA 版本，is_compatible 通过、import 不崩；运行时不编译 op，不影响 cosyvoice 推理。
import torch as _torch  # noqa: E402
_ds_builder_py = '/opt/conda/lib/python3.10/site-packages/deepspeed/ops/op_builder/builder.py'
try:
    with open(_ds_builder_py, 'r') as _f:
        _src = _f.read()
    if 'raise MissingCUDAException("CUDA_HOME does not exist' in _src:
        _cv_ver = _torch.version.cuda or '12.1'
        _maj, _min = _cv_ver.split('.')[:2]
        _src = _src.replace(
            'raise MissingCUDAException("CUDA_HOME does not exist, unable to compile CUDA op(s)")',
            f'return (int({_maj}), int({_min}))  # patched by server-wrapper: 无 nvcc，DS_BUILD_OPS=0 绕过'
        )
        with open(_ds_builder_py, 'w') as _f:
            _f.write(_src)
        print(f'[wrapper] patched deepspeed installed_cuda_version -> ({_maj}, {_min})', flush=True)
except Exception as _e:  # patch 失败不阻塞，原 import 会暴露真实错误
    print(f'[wrapper] patch deepspeed 失败（忽略，原错误将暴露）: {_e}', flush=True)

import cosyvoice.cli.cosyvoice as _cv  # noqa: E402

_orig_AutoModel = _cv.AutoModel


def _patched_AutoModel(**kwargs):
    """AutoModel 包装：构造实例后合并挂载目录里的自定义音色 .pt"""
    model = _orig_AutoModel(**kwargs)

    # 懒加载 torch：仅在真正合并时 import，避免顶层加载拖慢启动
    import torch

    if not os.path.isdir(SPK2INFO_DIR):
        print(f'[spk2info] 挂载目录不存在: {SPK2INFO_DIR}，跳过合并', flush=True)
        return model

    pts = sorted(glob.glob(os.path.join(SPK2INFO_DIR, '*.pt')))
    if not pts:
        print(
            f'[spk2info] 挂载目录无 .pt 文件: {SPK2INFO_DIR}'
            f'（自定义音色需先由 pnpm build:cosyvoice-spk2info 生成并放入此目录）',
            flush=True,
        )
        return model

    merged = 0
    for pt in pts:
        try:
            data = torch.load(pt, map_location='cpu', weights_only=True)
            if isinstance(data, dict):
                model.frontend.spk2info.update(data)
                print(f'[spk2info] 合并音色 {list(data.keys())} <- {pt}', flush=True)
                merged += len(data)
            else:
                print(f'[spk2info] 跳过（内容非 dict）: {pt}', flush=True)
        except Exception as e:
            # 单个 .pt 加载失败不阻塞启动，仅告警
            print(f'[spk2info] 跳过（加载失败）: {pt}: {e}', flush=True)

    total = len(model.frontend.spk2info)
    print(
        f'[spk2info] 合并完成：新增 {merged} 个，当前共 {total} 个音色 '
        f'{list(model.frontend.spk2info.keys())}',
        flush=True,
    )
    return model


_cv.AutoModel = _patched_AutoModel

# 透传 sys.argv，让官方 server.py 的 argparse 正常解析 --port / --model_dir。
# runpy.run_path 以 __main__ 执行，等价于直接 `python server.py`：
#   - server.py 顶部 `from cosyvoice.cli.cosyvoice import AutoModel` 会拿到已 patch 的版本
#   - `if __name__ == '__main__'` 块触发，cosyvoice = AutoModel(...) 走合并逻辑
#   - uvicorn.run 阻塞，接管信号
runpy.run_path(SERVER_PY, run_name='__main__')
