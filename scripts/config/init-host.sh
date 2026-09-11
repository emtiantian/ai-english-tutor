#!/usr/bin/env bash
set -euo pipefail

BASE="${AI_TUTOR_HOME:-$HOME/.ai-english-tutor}"
mkdir -p "$BASE/app" "$BASE/data/certs" "$BASE/data/logs/gateway" "$BASE/backups"
chmod 700 "$BASE" "$BASE/data"
if [[ ! -f "$BASE/data/.env" ]]; then
  cp "$(cd "$(dirname "$0")/../.." && pwd)/.env.example" "$BASE/data/.env"
  chmod 600 "$BASE/data/.env"
  echo "已创建 $BASE/data/.env，请填写 API Key"
fi
echo "部署目录已初始化: $BASE"
