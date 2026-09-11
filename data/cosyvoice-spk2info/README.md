# CosyVoice 自定义音色目录

本目录用于存放 CosyVoice 自定义音色（spk2info）相关文件，配合
`docker-compose.cosyvoice.yml` 与 `scripts/cosyvoice/build-spk2info.mts`
使用。

## 目录用途

- 存放每个音色的**参考音频**（`.wav`）：CosyVoice 会基于该音频克隆音色。
- 存放每个音色的**spk2info.pt**：由参考音频经 CosyVoice 提取得到，推理时
  直接加载，避免每次启动都重跑提取流程。

## 文件命名约定

| 文件 | 说明 |
|------|------|
| `<spk_id>.wav` | 参考音频（5-15s 干净人声，16kHz/22050Hz 单声道） |
| `<spk_id>.pt`  | 由 `pnpm build:cosyvoice-spk2info` 生成的 spk2info 张量 |

`<spk_id>` 与 `.env` / persona 中 `TTS_COSYVOICE_SPK_ID` 保持一致。

## 默认音色 EnglishTutor

部署后默认使用 `EnglishTutor` 音色，应包含：

- `EnglishTutor.wav` — 参考音频
- `EnglishTutor.pt`  — 提取好的 spk2info（首次部署时由 build 脚本生成）

## 挂载与部署

- 该目录通过 `docker-compose.cosyvoice.yml` **只读挂载**到容器
  `/opt/CosyVoice/spk2info`。
- `server.py` 经 `scripts/cosyvoice/server-wrapper.py` 启动，启动时自动扫描本目录
  `*.pt`，逐个 `torch.load` 后合并到 `cosyvoice.frontend.spk2info`。官方 server.py
  原生只加载 `{model_dir}/spk2info.pt` 单文件，wrapper 补上了对挂载目录的扫描，
  无需手工把音色注入 modelscope 缓存。
- 部署时目录随 `AI_TUTOR_HOME/data` 一起走，不随代码 rsync——
  `scripts/deploy/server.sh` 的 rsync 排除规则已包含 `data/`，
  运行时数据不会反向覆盖服务器。
- 换机器部署时，只需：
  1. `pnpm push:server` 同步代码与 compose
  2. `pnpm build:cosyvoice-spk2info` 在具备 GPU 的机器上重新生成 `.pt`
     （或直接把旧机器的 `data/cosyvoice-spk2info/*.pt` scp 过来）

## Git 策略

- 本目录通过 `.gitignore` 例外规则保留 `.gitkeep` 与 `README.md` 入 git，
  保证 clone 后目录即存在，部署/脚本不必先 `mkdir -p`。
- 真实的 `.wav` 和 `.pt` 是**运行时数据**，不入 git（被 `data/` 规则忽略）。
- 首次部署需在服务器上运行 `pnpm build:cosyvoice-spk2info` 生成
  `EnglishTutor.pt`，或从已生成的机器 scp 过来。
