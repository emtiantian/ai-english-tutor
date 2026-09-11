#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TARGET="${ENV_FILE:-$ROOT/.env}"
NON_INTERACTIVE=false
[[ "${1:-}" == "--non-interactive" ]] && NON_INTERACTIVE=true

read_value() {
  local label="$1" current="$2" secret="${3:-false}" value
  if $NON_INTERACTIVE; then printf '%s' "$current"; return; fi
  if [[ "$secret" == true ]]; then
    read -r -s -p "$label: " value; echo >&2
  else
    read -r -p "$label [$current]: " value
  fi
  printf '%s' "${value:-$current}"
}

existing() {
  [[ -f "$TARGET" ]] && sed -n "s/^${1}=//p" "$TARGET" | tail -1 || true
}

current_llm="$(existing LLM_PROVIDER)"
current_tts="$(existing TTS_PROVIDER)"
llm="$(read_value 'LLM Provider (deepseek/mock)' "${current_llm:-deepseek}")"
tts="$(read_value 'TTS Provider (xiaomi/browser)' "${current_tts:-xiaomi}")"
deepseek_key="$(existing DEEPSEEK_API_KEY)"
xiaomi_key="$(existing XIAOMI_TTS_API_KEY)"
if [[ "$llm" == deepseek && -z "$deepseek_key" ]]; then deepseek_key="$(read_value 'DeepSeek API Key' '' true)"; fi
if [[ "$tts" == xiaomi && -z "$xiaomi_key" ]]; then xiaomi_key="$(read_value 'Xiaomi TTS API Key' '' true)"; fi

umask 077
cat > "$TARGET" <<ENV
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
CORS_ORIGIN=*
LLM_PROVIDER=$llm
DEEPSEEK_API_KEY=$deepseek_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
TTS_PROVIDER=$tts
XIAOMI_TTS_API_KEY=$xiaomi_key
XIAOMI_TTS_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
XIAOMI_TTS_MODE=preset
XIAOMI_TTS_VOICE=Chloe
ASR_PROVIDER=browser
ASR_LANGUAGE=en-US
VITE_BACKEND_URL=
ENV
"$ROOT/scripts/config/validate.sh" "$TARGET"
echo "已写入 $TARGET"
