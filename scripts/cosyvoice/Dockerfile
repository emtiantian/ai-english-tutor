# CosyVoice 官方 runtime/python/Dockerfile（本仓库内副本）
#
# 来源：FunAudioLLM/CosyVoice runtime/python/Dockerfile（main 分支）
# 在仓库内放副本的原因：CosyVoice 官方未发布 Docker 镜像、仅提供 Dockerfile，
# docker-compose.cosyvoice.yml 的 build 块需要一个本地 context（极小，仅本文件），
# 避免依赖 buildkit 拉 git context（国内代理不可靠）。上游绑定 pytorch 2.0.1 + cuda11.7，
# 不常变，定期同步上游即可。
#
# 代理机制：
#   构建时由 docker-compose.cosyvoice.yml 的 build.args 注入 HTTP_PROXY/HTTPS_PROXY，
#   配合 build.network: host，容器内 127.0.0.1:7890 即宿主机代理。
#   - apt 已切阿里云源、pip 用阿里云镜像，本身无需代理
#   - 仅 `git clone --recursive GitHub` 需要代理（HTTP_PROXY 环境变量对 git 生效）
#   - FROM 拉取 pytorch 基础镜像由 docker daemon 处理，需服务器配镜像加速或 daemon 代理
#
# 容器内关键路径（与 compose 挂载 / wrapper 对齐）：
#   /opt/CosyVoice/CosyVoice                            <- git clone 目标（代码根）
#   /opt/CosyVoice/CosyVoice/pretrained_models          <- 预置模型（compose bind mount）
#   /opt/CosyVoice/CosyVoice/runtime/python/fastapi/server.py <- 官方 FastAPI 入口

FROM pytorch/pytorch:2.0.1-cuda11.7-cudnn8-runtime
ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /opt/CosyVoice

# apt 合并为单层：换阿里云源 + 安装构建依赖 + 清理缓存，减少镜像层数与体积
RUN sed -i s@/archive.ubuntu.com/@/mirrors.aliyun.com/@g /etc/apt/sources.list && \
    apt-get update -y && \
    apt-get -y install --no-install-recommends git unzip git-lfs g++ && \
    rm -rf /var/lib/apt/lists/* && \
    git lfs install

# git clone 加重试：GitHub 经代理偶发断连，3 次失败即 exit 1（不再静默继续）
RUN for i in 1 2 3; do \
      echo "[git] 第 $i 次尝试 clone CosyVoice..." && \
      git clone --recursive https://github.com/FunAudioLLM/CosyVoice.git && break; \
      if [ $i -eq 3 ]; then echo "[git] clone 3 次均失败，退出构建" >&2; exit 1; fi; \
      echo "[git] 第 $i 次失败，10s 后重试..." >&2; sleep 10; \
      rm -rf CosyVoice; \
    done

# here we use python==3.10 because we cannot find an image which have both python3.8 and torch2.0.1-cu118 installed
# openai-whisper 的 setup.py 直接 import pkg_resources，且未声明 build-system requires，
# 在 pip 构建隔离环境中会报 ModuleNotFoundError；先装含 pkg_resources 的 setuptools + wheel，
# 再对 openai-whisper 单独使用 --no-build-isolation。
RUN pip3 install --upgrade pip -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host=mirrors.aliyun.com --no-cache-dir
RUN pip3 install "setuptools<70" wheel -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host=mirrors.aliyun.com --no-cache-dir
# deepspeed 在 import 时会尝试检测 CUDA_HOME 并编译 CUDA op；
# 基础镜像只有 CUDA runtime 没有 toolkit，设置 DS_BUILD_OPS=0 让其以纯 Python 安装，
# 避免运行时 "CUDA_HOME does not exist" 错误。
ENV DS_BUILD_OPS=0
# 使用 BuildKit cache mount 持久化 pip 缓存，已下载的 wheel 不会重复下载；
# 外层循环处理镜像/网络偶发断开，3 次失败即 exit 1（不再静默继续，避免后续 grpc_tools 步骤才报错）。
RUN --mount=type=cache,target=/root/.cache/pip \
    cd CosyVoice && \
    grep -v '^openai-whisper' requirements.txt > /tmp/requirements_no_whisper.txt && \
    for i in 1 2 3; do \
      echo "[pip] 第 $i 次尝试安装 requirements_no_whisper..." && \
      pip3 install -r /tmp/requirements_no_whisper.txt \
        -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host=mirrors.aliyun.com \
        --retries 10 --timeout 300 && break; \
      if [ $i -eq 3 ]; then echo "[pip] requirements_no_whisper 3 次均失败，退出构建" >&2; exit 1; fi; \
      echo "[pip] 第 $i 次失败，10s 后重试..." >&2; sleep 10; \
    done && \
    for i in 1 2 3; do \
      echo "[pip] 第 $i 次尝试安装 openai-whisper..." && \
      pip3 install --no-build-isolation "openai-whisper==20231117" \
        -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host=mirrors.aliyun.com \
        --retries 10 --timeout 300 && break; \
      if [ $i -eq 3 ]; then echo "[pip] openai-whisper 3 次均失败，退出构建" >&2; exit 1; fi; \
      echo "[pip] 第 $i 次失败，10s 后重试..." >&2; sleep 10; \
    done

# 安装后验证关键包：确保后续 grpc_tools.protoc 依赖就位，避免"装失败却被静默吞掉"
RUN python3 -c "import grpc_tools, onnxruntime, torchaudio, whisper; print('[verify] 关键包验证通过')"

RUN cd CosyVoice/runtime/python/grpc && python3 -m grpc_tools.protoc -I. --python_out=. --grpc_python_out=. cosyvoice.proto

# 镜像层 HEALTHCHECK（与 compose 探测一致，TCP 端口探测不占 GPU）：
# 仅作为镜像自带兜底；运行时以 docker-compose.cosyvoice.yml 的 healthcheck 为准。
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
  CMD python -c "import socket,sys; s=socket.socket(); s.settimeout(5); sys.exit(0 if s.connect_ex(('localhost',50000))==0 else 1)"
