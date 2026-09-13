---
name: https-cert-renewal
description: 审计并维护 acme.sh + Let's Encrypt + DNS-01 + Nginx/Docker 的 HTTPS 证书流程。适用于检查证书来源、续期任务、证书部署目录、Nginx 重载和公网可用性；不适用于购买商业证书或修改业务代码。
---

# HTTPS 证书自动化维护

把证书流程当作一个可验证的发布流程：先审计当前状态，再续期，最后确认正在提供的证书确实已经更新。

## 安全边界

- 先执行只读检查；不要打印私钥、DNS API token、完整环境变量或 acme.sh 账户密钥。
- 不删除旧证书，不覆盖 acme.sh 的配置，不修改已执行的线上配置而不保留回滚方式。
- 续期和重载前确认域名、证书目录、Compose 项目目录；生产操作完成后记录结果。

## 标准流程

1. 查找证书管理器：`acme.sh --list`，读取域名的配置文件，确认签发机构、验证方式、续期时间和 deploy/reload hook。
2. 检查部署链路：确认 acme.sh 的 `Le_RealKeyPath`、`Le_RealFullChainPath` 指向 Nginx 实际挂载的证书目录；确认目录权限和文件存在。
3. 检查服务：运行 `docker compose config --quiet`、`docker compose ps` 和 `docker compose exec -T gateway nginx -t`。
4. 续期：通过项目的 `scripts/deploy/cert-renew.sh <domain>` 调用 `acme.sh --cron`。不要直接把 cron 输出丢到 `/dev/null`。
5. 验证：检查证书主题、SAN、签发机构和到期时间；重载 Nginx；用 `openssl s_client -servername <domain>` 或外部 HTTPS 请求确认公网服务的证书指纹与部署文件一致。
6. 失败处理：保留日志，先修复 DNS/API、权限、端口或 reload hook，再重试；若 Nginx 校验失败，停止重载并恢复上一份有效证书。

## 推荐定时任务

```cron
0 3 * * * /home/haohe/data/.ai-english-tutor/app/scripts/deploy/cert-renew.sh emengtt.com
```

每日运行不会每天签发新证书，acme.sh 会根据到期时间决定是否续期。证书通常 90 天有效，建议在到期前 30 天开始检查，并对任务非零退出发送告警。

## 本项目入口

- 审计：`bash scripts/deploy/cert-check.sh emengtt.com`
- 续期、校验、重载：`bash scripts/deploy/cert-renew.sh emengtt.com`
- 运行日志：`$AI_TUTOR_HOME/data/logs/cert-renewal.log`

如果项目使用不同的部署目录，通过 `AI_TUTOR_HOME`、`AI_TUTOR_APP`、`AI_TUTOR_CERT_DIR`、`ACME_HOME` 和 `AI_TUTOR_LOG_DIR` 覆盖默认值。
