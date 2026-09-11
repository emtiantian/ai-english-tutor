# buildkitd 损伤排查与修复手册

> 2026-07-21 生成，2026-07-24 复检精简。buildkit 缓存损坏导致构建卡死的应急手册。

## 一、2026-07-24 复检结论：✅ 核心问题已解决

| 检查项               | 07-21（故障时）                      | 07-24（复检）                            |
| -------------------- | ------------------------------------ | ---------------------------------------- |
| 最小 alpine+apk 构建 | 150s 仅 6/32 包，卡死 36 分钟        | **12 秒完成** ✅                         |
| backend 镜像         | `5d545790`（docker commit 补丁镜像） | `90482cf3b841`（3 小时前正规 rebuild）✅ |
| builder              | default，缓存疑似损坏                | default（v0.26.2），内嵌缓存自行恢复     |

- **buildkit 卡死已恢复**：未走方案 A 新建 `fresh` builder，`default` 内嵌缓存自行恢复，实测最小构建 12s。
- **backend 已正规 rebuild**：含 aee0f09 / c4ea1d9 最新代码，不再是 commit 补丁镜像。
- **build cache 已清理**：`docker builder prune -f` 清掉 11.7GB 私有缓存（39.2GB -> 27.5GB；剩余为被镜像引用的 shared 层）。
- **deploy 脚本已加固**（见三）：build 失败/超时旧服务零中断。

> **根因**：build 被 `pkill`/kill 中断致 buildkit 内部 gc/索引不一致，缓存损坏后构建与 `prune` 均卡在 I/O。此风险源未消除（人为 kill / OOM / 部署中断均可再触发），故下方应急方案长期保留。

## 二、应急方案（按推荐顺序）

### 方案 A（推荐）：新建独立 buildx builder，绕过损坏的内嵌缓存

不碰 `default` builder 的损坏缓存，新建一个用独立 buildkit 容器的 builder。

```bash
ssh haohe@100.100.132.72 '
  # 1. 新建并切换 builder（driver=docker-container，独立 buildkit 进程）
  docker buildx create --name fresh --driver docker-container --use
  # 2. 验证
  docker buildx ls
  # 3. 试构建一个最小镜像，确认不再卡（预期 60-90s 完成）
  docker buildx build --builder fresh --load -t bktest - <<EOF
FROM alpine
RUN apk add --no-cache curl
EOF
'
```

若 `bktest` 构建 60-90 秒完成 -> 修复成功，后续 build 用 `fresh` builder。
若仍卡 -> 跳方案 B。

- **优点**：不碰损坏缓存，立即可用；`default` builder 仍保留。
- **缺点**：首次 build 无层缓存，略慢（但能完成）。

### 方案 B：清理 build cache + 重启 dockerd（彻底，需短暂停服）

直接清除损坏的缓存。prune 可能仍卡，配合重启 dockerd 强制释放。

```bash
ssh haohe@100.100.132.72 '
  # 1. 后台 prune（不阻塞 ssh）
  nohup docker builder prune --all -f > /tmp/prune.log 2>&1 &
  echo "prune 后台运行，pid=$!"

  # 2. 重启 dockerd（会停所有容器！）
  sudo systemctl restart docker

  # 3. docker 恢复后，手动重新拉起应用栈
  cd /home/haohe/data/.ai-english-tutor/app && \
    AI_TUTOR_HOME=/home/haohe/data/.ai-english-tutor \
    docker compose --env-file /home/haohe/data/.ai-english-tutor/data/.env \
      -f docker-compose.yml -f docker-compose.cosyvoice.yml up -d
'
```

> ⚠️ `systemctl restart docker` 会短暂停止所有容器。当前 Compose 服务使用 `restart: unless-stopped`，Docker 恢复后通常会自动拉起；仍需用 `docker compose ps` 验证。

- **优点**：彻底清除损坏缓存，`default` builder 恢复正常。
- **缺点**：需短暂停服（几十秒）。

### 方案 C（应急，不改环境）：禁用 buildkit，回退 legacy builder

临时用 legacy builder 构建，完全绕过 buildkit 缓存。

```bash
ssh haohe@100.100.132.72 '
  cd /home/haohe/data/.ai-english-tutor/app && \
  DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0 \
  AI_TUTOR_HOME=/home/haohe/data/.ai-english-tutor \
  docker compose --env-file /home/haohe/data/.ai-english-tutor/data/.env \
    -f docker-compose.yml -f docker-compose.cosyvoice.yml build backend
'
```

- **优点**：零环境改动，立即能用。
- **缺点**：legacy builder 慢、无缓存、无并行；仅应急。

### 方案 D（核弹）：重启服务器

```bash
ssh haohe@100.100.132.72 'sudo reboot'
# 等 60-90s，Compose 的 restart policy 会恢复服务
```

仅当 A/B/C 都失败。重启后必须检查 Docker 和全部 Compose 服务的健康状态。

## 三、deploy 脚本加固（2026-07-24 已落实 ✅）

> 部署脚本已重构：`deploy_services` 现位于 `scripts/deploy/lib/common.sh`（被 `scripts/deploy/server.sh` source）。原问题：`deploy_services` 先 `dc down` 再 `build`，build 一卡就宕机。已落实：

1. ✅ **先 build 后 down**：`deploy_services`（`scripts/deploy/lib/common.sh`）改为先 `build`（不停现有服务）再 `down` + `up -d`。build 失败/超时返回 1，`deploy_main` 不回滚，旧服务零中断。
2. ✅ **build 加超时**：`dc_tty` 支持 `DC_TTY_TIMEOUT` 前缀，build 调用 `DC_TTY_TIMEOUT=${BUILD_TIMEOUT:-600} dc_tty "build ..."`，卡死时 600s 超时退出（`timeout` 返回 124 -> dc_tty 失败 -> return 1）。
3. ✅ **只 rebuild 变更服务**：`core_services="backend frontend gateway"`（+whisper），cosyvoice 由 `pnpm deploy:cosyvoice` 独立构建，不纳入主部署 build。

当前 `deploy_services` 流程：

```bash
deploy_services() {
  ...
  # ① 先 build（不停现有服务）：失败/超时 return 1，旧服务仍在运行
  if ! DC_TTY_TIMEOUT=${BUILD_TIMEOUT} dc_tty "build --build-arg HTTP_PROXY=${proxy} ... ${core_services}"; then
    log_error "docker compose build 失败或超时（旧服务仍在运行，未切换）"
    return 1
  fi
  # ② build 成功后切换镜像：down + up（此阶段失败 return 2，触发回滚）
  dc down
  if ! dc_tty "up -d ..."; then return 2; fi
}
```

`deploy_main` 据返回码决定是否回滚：`return 1`（build 失败）不回滚、旧服务继续运行；`return 2`（up 失败）触发 `rollback` 恢复备份。

## 四、相关 context

- `⑫ CosyVoice 远程部署稳定性优化`（ctx-20260720-103841763730-3ef8b97b）-- systemd 自启、cosyvoice compose 叠加
- `⑬ spk2info wrapper + 全链路验证 + systemd 自启`
