#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN="${1:-${CERT_DOMAIN:-emengtt.com}}"
AI_TUTOR_HOME="${AI_TUTOR_HOME:-/home/haohe/data/.ai-english-tutor}"
APP_DIR="${AI_TUTOR_APP:-$AI_TUTOR_HOME/app}"
ACME_HOME="${ACME_HOME:-$HOME/.acme.sh}"
ACME_BIN="${ACME_BIN:-$ACME_HOME/acme.sh}"
LOG_DIR="${AI_TUTOR_LOG_DIR:-$AI_TUTOR_HOME/data/logs}"
export AI_TUTOR_HOME
mkdir -p "$LOG_DIR"
exec >>"$LOG_DIR/cert-renewal.log" 2>&1

printf '\n[%s] 开始检查 %s\n' "$(date -Is)" "$DOMAIN"
[[ -x "$ACME_BIN" ]] || { printf '找不到 acme.sh: %s\n' "$ACME_BIN" >&2; exit 1; }
"$ACME_BIN" --cron --home "$ACME_HOME"

bash "$(dirname "$0")/cert-check.sh" "$DOMAIN"
cd "$APP_DIR"
docker compose exec -T gateway nginx -s reload
docker compose exec -T gateway nginx -t
printf '[%s] 续期任务完成，Nginx 已校验并重载。\n' "$(date -Is)"
