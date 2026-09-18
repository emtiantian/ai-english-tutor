# Scripts

脚本按职责分组，第一版只维护当前实际运行的 DeepSeek + Xiaomi TTS + 浏览器 ASR 路径。

| 目录      | 用途                    | 常用命令                                                                  |
| --------- | ----------------------- | ------------------------------------------------------------------------- |
| `dev/`    | 本地启动与端口清理      | `pnpm local`, `pnpm dev:clean`                                            |
| `config/` | 创建、修改和验证 `.env` | `pnpm setup`, `pnpm setup:set`                                            |
| `deploy/` | HTTPS 证书检查与续期    | `bash scripts/deploy/cert-check.sh` / `bash scripts/deploy/cert-renew.sh` |
| `hooks/`  | 安装仓库 Git hooks      | `bash scripts/hooks/install.sh`                                           |

生产 ECS 部署不再由仓库内脚本自动推送。连接 ECS 后，在 `/root/.ai-english-tutor/app` 中使用 Docker Compose 完成配置检查、镜像构建、服务更新和健康检查；修改 `gateway/` 后必须重新构建 gateway 镜像。远端由 Docker Compose 的 `restart: unless-stopped` 保持服务运行，不依赖 PM2。

## HTTPS 证书

`deploy/cert-check.sh` 只读检查证书文件、到期时间、Compose 和 Nginx 配置；`deploy/cert-renew.sh` 调用已安装的 `acme.sh`，完成续期后校验并重载 gateway。脚本不会输出私钥或 DNS API 密钥，运行日志写入 `$AI_TUTOR_HOME/data/logs/cert-renewal.log`。

在服务器上使用拥有应用目录权限的账号安装每日任务（不要再把输出重定向到 `/dev/null`）：

```cron
0 3 * * * /home/haohe/data/.ai-english-tutor/app/scripts/deploy/cert-renew.sh emengtt.com
```

证书仍由 Let's Encrypt 免费签发（通常 90 天有效）。续期任务必须保留日志并在失败时告警；DNS API 凭据应只保存在服务器的 acme.sh 环境中。
