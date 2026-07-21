#!/usr/bin/env bash
# AI English Tutor —— .env 校验脚本
#
# 可直接执行，也可被 source 后调用 validate_env 函数。
#
# 用法：
#   bash scripts/validate-env.sh [.env 文件路径]        # 默认校验当前目录 .env
#   bash scripts/validate-env.sh --strict [.env 文件路径] # 未知变量也报错
#   source scripts/validate-env.sh
#   validate_env [.env 文件路径] [--strict]
#
# 校验规则：
#   1. 根据 LLM_PROVIDER / TTS_PROVIDER / ASR_PROVIDER 检查必填 key。
#   2. 必填 key 缺失时返回非零退出码。
#   3. 默认对未知变量（不在 .env.example / 已知白名单中的 key）仅警告。
#   4. --strict 模式下未知变量也返回非零。
#   5. 提示 .env.example 中存在但当前 .env 缺失的变量（供用户参考）。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [ -t 2 ]; then
  RED=$'\033[0;31m'
  YELLOW=$'\033[1;33m'
  GREEN=$'\033[0;32m'
  BLUE=$'\033[0;34m'
  NC=$'\033[0m'
else
  RED=''
  YELLOW=''
  GREEN=''
  BLUE=''
  NC=''
fi


# 已知变量白名单（不在 .env.example 中但代码会读取）
EXTRA_KNOWN_VARS=(
  # Docker / 镜像内部使用
  "DEFAULT_VOCAB_DIR"
  # 脚本内部使用
  "AI_TUTOR_HOME"
)

# 读取 env 文件中 key 的最后一个匹配值，并去掉行内注释
_env_get() {
  local file="$1" key="$2"
  local raw
  raw=$(grep -E "^${key}=" "${file}" 2>/dev/null | tail -1 | cut -d= -f2- || true)
  # 去掉行内注释（空格 + # 及其后内容）
  echo "${raw}" | sed -E 's/[[:space:]]+#.*$//'
}

# 检查 key 是否在数组中
_in_array() {
  local value="$1"
  shift
  for item in "$@"; do
    [ "${item}" = "${value}" ] && return 0
  done
  return 1
}

# 检查 key 是否已设置
_is_set() {
  local file="$1" key="$2"
  local value
  value=$(_env_get "${file}" "${key}")
  [ -n "${value}" ]
}

validate_env() {
  local strict=false
  local env_file="${PROJECT_ROOT}/.env"

  # 解析函数参数
  for arg in "$@"; do
    case "${arg}" in
      --strict) strict=true ;;
      -h|--help)
        cat <<EOF
用法:
  validate_env [.env 文件路径] [--strict]
EOF
        return 0
        ;;
      *) env_file="${arg}" ;;
    esac
  done

  if [ ! -f "${env_file}" ]; then
    echo "${RED}[ERROR]${NC} 找不到 .env 文件: ${env_file}" >&2
    return 1
  fi

  local env_example="${PROJECT_ROOT}/.env.example"
  if [ ! -f "${env_example}" ]; then
    echo "${RED}[ERROR]${NC} 找不到模板文件: ${env_example}" >&2
    return 1
  fi

  # 收集 .env.example 中所有 key
  local example_keys=()
  while IFS= read -r line || [ -n "${line}" ]; do
    local stripped="${line#\#}"
    stripped="${stripped# }"
    if [[ "${stripped}" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
      local key="${stripped%%=*}"
      example_keys+=("${key}")
    fi
  done < "${env_example}"

  # 所有已知变量
  local known_vars=("${example_keys[@]}" "${EXTRA_KNOWN_VARS[@]}")

  # 读取当前 .env 中的所有 key
  local env_keys=()
  while IFS= read -r line || [ -n "${line}" ]; do
    if [[ "${line}" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
      local key="${line%%=*}"
      env_keys+=("${key}")
    fi
  done < "${env_file}"

  # 读取 provider
  local llm_provider tts_provider asr_provider
  llm_provider=$(_env_get "${env_file}" "LLM_PROVIDER")
  tts_provider=$(_env_get "${env_file}" "TTS_PROVIDER")
  asr_provider=$(_env_get "${env_file}" "ASR_PROVIDER")

  [ -z "${llm_provider}" ] && llm_provider="mock"
  [ -z "${tts_provider}" ] && tts_provider="browser"
  [ -z "${asr_provider}" ] && asr_provider="browser"

  local errors=()
  local warnings=()

  add_error() { errors+=("$1"); }
  add_warning() { warnings+=("$1"); }

  # LLM 必填
  case "${llm_provider}" in
    deepseek)
      _is_set "${env_file}" "DEEPSEEK_API_KEY" || add_error "LLM_PROVIDER=deepseek 时 DEEPSEEK_API_KEY 必填"
      ;;
    openai)
      _is_set "${env_file}" "OPENAI_API_KEY" || add_error "LLM_PROVIDER=openai 时 OPENAI_API_KEY 必填"
      ;;
    volcengine)
      _is_set "${env_file}" "VOLCENGINE_LLM_API_KEY" || add_error "LLM_PROVIDER=volcengine 时 VOLCENGINE_LLM_API_KEY 必填"
      _is_set "${env_file}" "VOLCENGINE_LLM_MODEL" || add_error "LLM_PROVIDER=volcengine 时 VOLCENGINE_LLM_MODEL（推理接入点 ID）必填"
      ;;
    xiaomi)
      _is_set "${env_file}" "XIAOMI_API_KEY" || add_error "LLM_PROVIDER=xiaomi 时 XIAOMI_API_KEY 必填"
      ;;
    mock)
      ;;
    *)
      add_error "未知的 LLM_PROVIDER: ${llm_provider}"
      ;;
  esac

  # TTS 必填
  case "${tts_provider}" in
    volcengine)
      _is_set "${env_file}" "VOLCENGINE_TTS_API_KEY" || add_error "TTS_PROVIDER=volcengine 时 VOLCENGINE_TTS_API_KEY 必填"
      ;;
    xiaomi)
      _is_set "${env_file}" "XIAOMI_TTS_API_KEY" || add_error "TTS_PROVIDER=xiaomi 时 XIAOMI_TTS_API_KEY 必填"
      ;;
    cosyvoice|browser)
      ;;
    *)
      add_error "未知的 TTS_PROVIDER: ${tts_provider}"
      ;;
  esac

  # ASR 必填（考虑 fallback）
  case "${asr_provider}" in
    volcengine)
      if ! _is_set "${env_file}" "VOLCENGINE_ASR_API_KEY"; then
        if ! _is_set "${env_file}" "VOLCENGINE_TTS_API_KEY"; then
          add_warning "ASR_PROVIDER=volcengine 时 VOLCENGINE_ASR_API_KEY 为空，且未配置 VOLCENGINE_TTS_API_KEY 作为回退"
        fi
      fi
      ;;
    xiaomi)
      if ! _is_set "${env_file}" "XIAOMI_ASR_API_KEY"; then
        if ! _is_set "${env_file}" "XIAOMI_API_KEY"; then
          add_warning "ASR_PROVIDER=xiaomi 时 XIAOMI_ASR_API_KEY 为空，且未配置 XIAOMI_API_KEY 作为回退"
        fi
      fi
      ;;
    whisper|browser)
      ;;
    *)
      add_error "未知的 ASR_PROVIDER: ${asr_provider}"
      ;;
  esac

  # 检查未知变量
  local unknown_vars=()
  if [ ${#env_keys[@]} -gt 0 ]; then
    for key in "${env_keys[@]}"; do
      if ! _in_array "${key}" "${known_vars[@]}"; then
        unknown_vars+=("${key}")
      fi
    done
  fi

  if [ ${#unknown_vars[@]} -gt 0 ]; then
    local msg="当前 .env 中存在代码未消费的变量（将被忽略）:"
    for key in "${unknown_vars[@]}"; do
      msg="${msg}\n  - ${key}"
    done
    if ${strict}; then
      add_error "${msg}"
    else
      add_warning "${msg}"
    fi
  fi

  # 检查 .env.example 中存在但 .env 缺失的变量
  local missing_from_example=()
  if [ ${#example_keys[@]} -gt 0 ]; then
    for key in "${example_keys[@]}"; do
      if ! _in_array "${key}" "${env_keys[@]}"; then
        missing_from_example+=("${key}")
      fi
    done
  fi

  if [ ${#missing_from_example[@]} -gt 0 ]; then
    local msg="模板 .env.example 中有以下变量在当前 .env 中缺失（将使用代码默认值）:"
    for key in "${missing_from_example[@]}"; do
      msg="${msg}\n  - ${key}"
    done
    add_warning "${msg}"
  fi

  # 输出结果
  echo "${BLUE}[VALIDATE]${NC} 校验文件: ${env_file}"
  echo "  LLM_PROVIDER=${llm_provider}, TTS_PROVIDER=${tts_provider}, ASR_PROVIDER=${asr_provider}"
  echo ""

  if [ ${#warnings[@]} -gt 0 ]; then
    for w in "${warnings[@]}"; do
      echo -e "${YELLOW}[WARN]${NC} ${w}"
    done
    echo ""
  fi

  if [ ${#errors[@]} -gt 0 ]; then
    for e in "${errors[@]}"; do
      echo -e "${RED}[ERROR]${NC} ${e}"
    done
    echo ""
    echo "${RED}校验失败，请补全上述配置。${NC}"
    return 1
  fi

  echo "${GREEN}[OK]${NC} 校验通过。"
  return 0
}

# 若直接执行本脚本，则调用 validate_env
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  validate_env "$@"
fi
