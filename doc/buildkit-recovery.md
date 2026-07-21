# buildkitd 损伤排查与修复手册

> 生成于 2026-07-21。记录 ⑬ CosyVoice 全链路验证部署期间暴露的 buildkit 缓存损坏问题，供下次正规 rebuild 后端时参考。

## 一、问题详述

### 现象
- `docker compose up --build`（deploy 脚本 `deploy_services` 触发）卡死在 `apk add` 阶段：36 分钟仅 10s CPU，纯 I/O 等待。
- 独立 alpine 容器 `docker run --rm alpine apk add ...` 60 秒完成 → **排除网络问题**。
- `docker builder prune` 两次超时（60s / 180s）→ buildkit 缓存删除极慢，状态受损。
- 测试构建 alpine+apk，150 秒仅完成 6/32 个包 → buildkit 构建极慢。

### 根因
buildkit 内嵌缓存状态损坏（推测：此前一次构建被 `pkill`/kill 中断，buildkit 内部 gc / 索引不一致）。损坏的缓存导致：
- 后续构建读取缓存层时卡在 I/O；
- `prune` 删除损坏记录时同样卡死。

### 当前状态（2026-07-21 诊断）
```
builder:    仅 default（driver=docker，内嵌 buildkit v0.26.2），无独立 buildkit 容器
Build Cache: 10.59GB / 232 条，reclaimable 7.58GB（膨胀且疑似损坏）
Images:     30.28GB，92% reclaimable（大量悬空旧镜像）
backend 镜像: ai-english-tutor-backend:latest (5d545790，docker commit 补丁镜像，非正规 rebuild)
```

## 二、影响

1. **部署卡死 + 生产宕机**：`scripts/deploy-to-server.sh` 的 `deploy_services`（line 370-377）先 `dc down`（停所有服务）再 `up --build`。buildkit 一旦卡死 → 服务已停却起不来 → 宕机。本次靠绕过 `up -d`（不 rebuild）恢复。
2. **backend 镜像过时**：当前 `5d545790` 是 `docker commit` 补 SQL 的镜像，**缺 aee0f09（tts-health 启动探测）+ c4ea1d9（spk2info wrapper）后端侧改动**。合成功能不受影响，但缺启动期 cosyvoice 探活告警。

## 三、解决方案（按推荐顺序）

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

若 `bktest` 构建 60-90 秒完成 → 修复成功，后续 build 用 `fresh` builder。
若仍卡 → 跳方案 B。

- **优点**：不碰损坏缓存，立即可用；`default` builder 仍保留。
- **缺点**：首次 build 无层缓存，略慢（但能完成）。

### 方案 B：清理 build cache + 重启 dockerd（彻底，需短暂停服）

直接清除损坏的 10GB 缓存。prune 可能仍卡，配合重启 dockerd 强制释放。

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

> ⚠️ `systemctl restart docker` 会停所有容器。`cosyvoice.service` 是 oneshot（仅开机触发），docker restart **不会**自动重跑它，必须手动 `up -d` 恢复。

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
# 等 60-90s，cosyvoice.service 开机自启拉起整个栈
```

仅当 A/B/C 都失败。systemd 已配 `cosyvoice.service`（enabled），开机自动 `docker compose up -d`。

## 四、修复后：正规 rebuild backend 验证

修好 buildkit 后，正规 rebuild backend 镜像（含 aee0f09 / c4ea1d9 最新代码）。

> Dockerfile（`apps/tutor-server/Dockerfile`）line 41 + line 62 都有 `COPY *.sql`，正规 rebuild **必然含 SQL**，不会再现 ENOENT。

```bash
# 方式 1：完整部署（本地跑，会触发 up --build）
pnpm push:server --skip-tests

# 方式 2：只 rebuild backend（不跑完整 deploy，更安全）
ssh haohe@100.100.132.72 '
  cd /home/haohe/data/.ai-english-tutor/app && \
  AI_TUTOR_HOME=/home/haohe/data/.ai-english-tutor \
  docker compose --env-file /home/haohe/data/.ai-english-tutor/data/.env \
    -f docker-compose.yml -f docker-compose.cosyvoice.yml up -d --build backend
'
```

### 验证清单

```bash
# 1. 镜像已更新（ID 变化、CreatedSince 变 just now）
ssh haohe@100.100.132.72 \
  'docker images ai-english-tutor-backend --format "{{.ID}} | {{.CreatedSince}} | {{.Size}}"'

# 2. SQL 文件在镜像内（正规 rebuild 不会再现 ENOENT）
ssh haohe@100.100.132.72 \
  'docker run --rm --entrypoint sh ai-english-tutor-backend:latest -c "ls -la /app/dist/db/migrations/"'

# 3. backend healthy + 含 tts-health 启动探测
ssh haohe@100.100.132.72 \
  'docker compose -f /home/haohe/data/.ai-english-tutor/app/docker-compose.yml \
     -f /home/haohe/data/.ai-english-tutor/app/docker-compose.cosyvoice.yml ps'
ssh haohe@100.100.132.72 \
  'docker logs ai-english-tutor-backend-1 2>&1 | grep -iE "tts.?health|cosyvoice" | head'
```

## 五、预防 / deploy 脚本改进建议

`scripts/deploy-to-server.sh` 的 `deploy_services`（line 370-377）先 `dc down` 再 `up --build`，build 一卡就宕机。建议改进：

1. **先 build 后 down**：`up --build -d` 拆成先 `build`、再 `down` + `up -d`。build 失败时旧服务仍在运行，不宕机。
2. **build 加超时**：`build` 命令包 `timeout 600`，超时不 down 旧服务。
3. **只 rebuild 变更服务**：用 `up -d --build backend`（仅 backend 有 Dockerfile 改动时），避免全量 rebuild frontend。

示例改进（`deploy_services`）：

```bash
deploy_services() {
  log_info "构建镜像（不停止现有服务）..."
  dc_tty "build"          # 先 build，失败不宕机
  log_info "切换到新镜像..."
  dc down
  dc "up -d"              # 用已构建好的镜像启动
  log_info "服务已启动，等待健康检查"
}
```

## 六、相关 context

- `⑫ CosyVoice 远程部署稳定性优化`（ctx-20260720-103841763730-3ef8b97b）—— systemd 自启、cosyvoice compose 叠加
- 本次 `⑬ spk2info wrapper + 全链路验证 + systemd 自启`（待记录）
