# Scripts

脚本按职责分组，第一版只维护当前实际运行的 DeepSeek + Xiaomi TTS + 浏览器 ASR 路径。

| 目录      | 用途                    | 常用命令                        |
| --------- | ----------------------- | ------------------------------- |
| `dev/`    | 本地启动与端口清理      | `pnpm local`, `pnpm dev:clean`  |
| `config/` | 创建、修改和验证 `.env` | `pnpm setup`, `pnpm setup:set`  |
| `deploy/` | Docker Compose 远程部署 | `pnpm push:server`              |
| `hooks/`  | 安装仓库 Git hooks      | `bash scripts/hooks/install.sh` |

部署脚本在上传前要求工作区干净，并默认执行类型检查、前后端测试和生产构建。远端由 Docker Compose 的 `restart: unless-stopped` 保持服务运行，不依赖 PM2。
