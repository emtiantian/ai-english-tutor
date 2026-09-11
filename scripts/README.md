# Scripts

脚本按职责分组，日常优先使用根目录 `package.json` 中的 pnpm 命令。

| 目录         | 用途                              | 主要入口                                                 |
| ------------ | --------------------------------- | -------------------------------------------------------- |
| `dev/`       | 本地启动和端口清理                | `pnpm local`、`pnpm dev:clean`                           |
| `config/`    | 初始化数据目录、生成和校验 `.env` | `pnpm run setup`、`pnpm run setup:set`                   |
| `deploy/`    | 主服务和 CosyVoice 远程部署       | `pnpm push:server`、`pnpm deploy:cosyvoice`              |
| `cosyvoice/` | CosyVoice 镜像资源与诊断工具      | `pnpm verify:cosyvoice`、`pnpm build:cosyvoice-spk2info` |
| `test/`      | 远程 ASR 和测试音频工具           | 直接执行对应脚本                                         |
| `hooks/`     | Git hooks 安装                    | `bash scripts/hooks/install.sh`                          |

`config/lib/` 和 `deploy/lib/` 是内部库，不作为独立入口。远程目标默认使用个人服务器配置，也可通过 `REMOTE_HOST`、`REMOTE_USER`、`REMOTE_DIR` 覆盖。
