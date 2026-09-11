#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env}"
[[ -f "$ENV_FILE" ]] || { echo "配置文件不存在: $ENV_FILE" >&2; exit 1; }

get_env() {
  sed -n "s/^${1}=//p" "$ENV_FILE" | tail -1 | sed 's/[[:space:]]*#.*$//'
}

errors=()
llm="$(get_env LLM_PROVIDER)"
tts="$(get_env TTS_PROVIDER)"
asr="$(get_env ASR_PROVIDER)"

case "$llm" in
  deepseek) [[ -n "$(get_env DEEPSEEK_API_KEY)" ]] || errors+=("DEEPSEEK_API_KEY 必填") ;;
  mock) ;;
  *) errors+=("LLM_PROVIDER 仅支持 deepseek 或 mock") ;;
esac
case "$tts" in
  xiaomi) [[ -n "$(get_env XIAOMI_TTS_API_KEY)" ]] || errors+=("XIAOMI_TTS_API_KEY 必填") ;;
  browser) ;;
  *) errors+=("TTS_PROVIDER 仅支持 xiaomi 或 browser") ;;
esac
[[ "$asr" == "browser" ]] || errors+=("ASR_PROVIDER 必须为 browser")

if ((${#errors[@]})); then
  printf '配置错误:\n' >&2
  printf '  - %s\n' "${errors[@]}" >&2
  exit 1
fi
printf '配置有效: LLM=%s TTS=%s ASR=%s\n' "$llm" "$tts" "$asr"
