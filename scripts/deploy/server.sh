#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REMOTE_HOST="${REMOTE_HOST:-100.100.132.72}"
REMOTE_USER="${REMOTE_USER:-haohe}"
REMOTE_DIR="${REMOTE_DIR:-/home/haohe/data/.ai-english-tutor}"
REMOTE_APP="$REMOTE_DIR/app"
REMOTE_DATA="$REMOTE_DIR/data"
DRY_RUN=false
SKIP_TESTS=false
USE_LOCAL_ENV=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --skip-tests) SKIP_TESTS=true ;;
    --use-local-env) USE_LOCAL_ENV=true ;;
    --) ;;
    *) echo "未知参数: $arg" >&2; exit 1 ;;
  esac
done

run() {
  if $DRY_RUN; then printf '[dry-run]'; printf ' %q' "$@"; printf '\n'; else "$@"; fi
}
remote() {
  if $DRY_RUN; then echo "[dry-run] ssh $REMOTE_USER@$REMOTE_HOST $*"; else ssh "$REMOTE_USER@$REMOTE_HOST" "$@"; fi
}

if ! $SKIP_TESTS; then
  pnpm typecheck
  pnpm --filter tutor-app test
  pnpm --filter @ai-english-tutor/server test
  pnpm build
fi

git diff --quiet && git diff --cached --quiet || {
  echo '工作区有未提交改动，拒绝部署。' >&2
  exit 1
}

remote "mkdir -p '$REMOTE_APP' '$REMOTE_DATA' '$REMOTE_DIR/backups'"
if $USE_LOCAL_ENV; then
  [[ -f "$ROOT/.env" ]] || { echo '缺少本地 .env' >&2; exit 1; }
  run scp "$ROOT/.env" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_DATA/.env"
fi

remote "test -f '$REMOTE_DATA/.env'" || {
  echo "远端缺少 $REMOTE_DATA/.env，请先运行 scripts/config/init-host.sh 或使用 --use-local-env" >&2
  exit 1
}

stamp="$(date +%Y%m%d-%H%M%S)"
remote "if [ -f '$REMOTE_APP/docker-compose.yml' ]; then tar -czf '$REMOTE_DIR/backups/app-$stamp.tar.gz' -C '$REMOTE_APP' .; fi"

rsync_args=(-az --delete --exclude .git --exclude node_modules --exclude .env --exclude .dev-data)
$DRY_RUN && rsync_args+=(--dry-run)
rsync "${rsync_args[@]}" "$ROOT/" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_APP/"

remote "cd '$REMOTE_APP' && bash scripts/config/validate.sh '$REMOTE_DATA/.env'"
remote "cd '$REMOTE_APP' && AI_TUTOR_HOME='$REMOTE_DIR' docker compose config --quiet"
remote "cd '$REMOTE_APP' && AI_TUTOR_HOME='$REMOTE_DIR' docker compose up -d --build --remove-orphans"
remote "cd '$REMOTE_APP' && AI_TUTOR_HOME='$REMOTE_DIR' docker compose ps"
remote "curl -fsS --retry 12 --retry-delay 5 'http://127.0.0.1/api/health'"

echo "部署完成: $REMOTE_USER@$REMOTE_HOST ($REMOTE_APP)"
