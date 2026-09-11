#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"
KEY="${1:-}"
VALUE="${2:-}"
ALLOWED='^(DEEPSEEK_API_KEY|XIAOMI_TTS_API_KEY|XIAOMI_TTS_VOICE|XIAOMI_TTS_VOICE_DESIGN|XIAOMI_TTS_MODE)$'
[[ "$KEY" =~ $ALLOWED ]] || { echo "用法: pnpm setup:set KEY VALUE" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || cp "$ROOT/.env.example" "$ENV_FILE"
if grep -q "^${KEY}=" "$ENV_FILE"; then
  KEY_NAME="$KEY" NEW_VALUE="$VALUE" perl -i -pe 's/^\Q$ENV{KEY_NAME}\E=.*/$ENV{KEY_NAME}=$ENV{NEW_VALUE}/' "$ENV_FILE"
else
  printf '%s=%s\n' "$KEY" "$VALUE" >> "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"
echo "已更新 $KEY"
