# AI English Tutor —— 交互式 .env 配置公共库
# 被 scripts/setup.sh 和 scripts/deploy-to-server.sh source 使用。
# 本文件只包含纯配置生成逻辑，不涉及 SSH、rsync、备份等远端操作。
#
# 设计原则：
#   - .env.example 是唯一 canonical 模板。
#   - 本库只负责“收集用户输入/环境变量”并渲染到模板，不再硬编码 env 正文。
#   - 渲染后的 .env 与模板结构一致，未激活 provider 的变量保持注释。
#   - 所有默认值优先从 .env.example 解析，避免脚本与模板双维护。

# ── 加载模板渲染库 ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/render-env.sh"

# ── 颜色输出（自动检测 TTY，非交互环境不输出颜色转义）──
if [ -t 2 ]; then
  RED=$'\033[0;31m'
  GREEN=$'\033[0;32m'
  YELLOW=$'\033[1;33m'
  NC=$'\033[0m'
else
  RED=''
  GREEN=''
  YELLOW=''
  NC=''
fi

log_info()  { echo "${GREEN}[INFO]${NC} $*"; }
log_warn()  { echo "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo "${RED}[ERROR]${NC} $*" >&2; }

# ── 交互式 prompt 工具 ──
prompt() {
  local message="$1"
  local default="${2:-}"
  local input
  if [ -n "${default}" ]; then
    read -rp "${message} [${default}]: " input
    echo "${input:-${default}}"
  else
    read -rp "${message}: " input
    echo "${input}"
  fi
}

# 静默输入：用于 API Key，不回显
prompt_secret() {
  local message="$1"
  local existing="${2:-}"
  local input
  if [ -n "${existing}" ]; then
    read -srp "${message}（已输入，回车保留原值）: " input
    echo "" >&2
    echo "${input:-${existing}}"
  else
    read -srp "${message}: " input
    echo "" >&2
    echo "${input}"
  fi
}

prompt_yes_no() {
  local message="$1"
  local input
  read -rp "${message} [y/N]: " input
  [[ "${input}" =~ ^[Yy]$ ]]
}

# 读取 env 文件中 key 的最后一个匹配值，并去掉行内注释
env_get() {
  local file="$1" key="$2"
  [ -n "${file}" ] && [ -f "${file}" ] || return 0
  local raw
  raw=$(grep -E "^${key}=" "${file}" | tail -1 | cut -d= -f2-)
  # 去掉行内注释（空格 + # 及其后内容）
  echo "${raw}" | sed -E 's/[[:space:]]+#.*$//'
}

# 从 .env.example 模板解析 key 的默认值（包括被注释掉的行）
# 行为：匹配 ^KEY= 或 ^# KEY= 或 ^#KEY= 的最后一行，返回等号后的值（去除行内注释）
env_example_default() {
  local template_file="$1"
  local key="$2"
  if [ ! -f "${template_file}" ]; then
    return 0
  fi
  local raw
  raw=$(grep -E "^(#[[:space:]]*)?${key}=" "${template_file}" 2>/dev/null | tail -1)
  # 去掉前导注释标记和空格
  raw=$(echo "${raw}" | sed -E "s/^[[:space:]]*#[[:space:]]*//")
  # 去掉 key=（只去掉一次）
  raw="${raw#${key}=}"
  # 去掉行内注释
  echo "${raw}" | sed -E 's/[[:space:]]+#.*$//'
}

# 安全地获取一个值：先看环境变量，再看现有文件，最后使用 .env.example 默认值
# 注意：env_name 为硬编码字符串，eval 安全。
resolve_value() {
  local env_name="$1"
  local existing_file="$2"
  local key="$3"
  local default_value="$4"
  local env_value=""

  # setup.sh --yes 也支持用进程环境变量生成配置；远程部署脚本会显式关闭，
  # 避免部署者本机 shell 中的 *_API_KEY 覆盖服务器已有值。
  if [ "${GENERATE_USE_PROCESS_ENV:-true}" = "true" ]; then
    eval "env_value=\"\${${env_name}:-}\""
    if [ -n "${env_value}" ]; then
      echo "${env_value}"
      return
    fi
  fi

  local existing_value
  existing_value=$(env_get "${existing_file}" "${key}")
  if [ -n "${existing_value}" ]; then
    echo "${existing_value}"
    return
  fi

  echo "${default_value}"
}

# 便捷封装：使用 .env.example 作为默认值来源
resolve_example() {
  local env_name="$1"
  local existing_file="$2"
  local key="$3"
  local template_file="${4:-${TEMPLATE_FILE:-}}"
  resolve_value "${env_name}" "${existing_file}" "${key}" "$(env_example_default "${template_file}" "${key}")"
}

# ── 核心：交互式/非交互式生成 .env ──
# 用法：generate_env <output_file> [existing_file] [noninteractive]
#   output_file:    要写入的 .env 路径
#   existing_file:  作为默认值来源的已有 .env（可选）
#   noninteractive: 为 true 时直接读取环境变量/默认值，不 prompt
# 副作用：设置全局变量 GENERATED_ENABLE_WHISPER / GENERATED_ENABLE_COSYVOICE
# 注意：bash 3 兼容，不要使用 local -n / associative array / [[ -v ]]
generate_env() {
  local output_file="$1"
  local existing_file="${2:-}"
  local noninteractive="${3:-false}"

  # 记录生成模式供提示逻辑使用；是否读取进程环境由 GENERATE_USE_PROCESS_ENV 控制。
  GENERATE_NONINTERACTIVE="${noninteractive}"

  local timestamp
  timestamp=$(date +%Y%m%d-%H%M%S)

  # 优先使用调用方已设置的 PROJECT_ROOT / LOCAL_PROJECT_ROOT
  local project_root="${LOCAL_PROJECT_ROOT:-${PROJECT_ROOT:-}}"
  if [ -z "${project_root}" ]; then
    project_root="$(cd "${SCRIPT_DIR}/../.." && pwd)"
  fi
  local template_file="${project_root}/.env.example"
  TEMPLATE_FILE="${template_file}"
  if [ ! -f "${template_file}" ]; then
    log_error "找不到模板文件: ${template_file}"
    return 1
  fi

  local overrides_file
  overrides_file=$(init_overrides_file)

  GENERATED_ENABLE_WHISPER=false
  GENERATED_ENABLE_COSYVOICE=false

  # ── Provider 选择 ──
  local llm_provider tts_provider asr_provider
  llm_provider=$(resolve_example "LLM_PROVIDER" "${existing_file}" "LLM_PROVIDER")
  tts_provider=$(resolve_example "TTS_PROVIDER" "${existing_file}" "TTS_PROVIDER")
  asr_provider=$(resolve_example "ASR_PROVIDER" "${existing_file}" "ASR_PROVIDER")

  if ! $noninteractive; then
    llm_provider=$(prompt "LLM 厂商 (volcengine/deepseek/xiaomi/openai/mock)" "${llm_provider}")
    tts_provider=$(prompt "TTS 厂商 (browser/volcengine/xiaomi/cosyvoice)" "${tts_provider}")
    asr_provider=$(prompt "ASR 厂商 (browser/volcengine/whisper/xiaomi)" "${asr_provider}")
  fi

  append_override "${overrides_file}" "LLM_PROVIDER" "${llm_provider}"
  append_override "${overrides_file}" "TTS_PROVIDER" "${tts_provider}"
  append_override "${overrides_file}" "ASR_PROVIDER" "${asr_provider}"

  # ── 服务器设置 ──
  local port node_env log_level cors_origin heartbeat server_name
  port=$(resolve_example "PORT" "${existing_file}" "PORT")
  node_env=$(resolve_example "NODE_ENV" "${existing_file}" "NODE_ENV")
  log_level=$(resolve_example "LOG_LEVEL" "${existing_file}" "LOG_LEVEL")
  cors_origin=$(resolve_example "CORS_ORIGIN" "${existing_file}" "CORS_ORIGIN")
  heartbeat=$(resolve_example "SSE_HEARTBEAT_INTERVAL" "${existing_file}" "SSE_HEARTBEAT_INTERVAL")
  server_name=$(resolve_example "SERVER_NAME" "${existing_file}" "SERVER_NAME")

  if ! $noninteractive; then
    port=$(prompt "HTTP 端口" "${port}")
    node_env=$(prompt "NODE_ENV (development/production)" "${node_env}")
    log_level=$(prompt "日志级别 (debug/info/warn/error)" "${log_level}")
    cors_origin=$(prompt "CORS_ORIGIN" "${cors_origin}")
    heartbeat=$(prompt "SSE 心跳间隔（毫秒）" "${heartbeat}")
    server_name=$(prompt "SERVER_NAME（HTTPS 虚拟主机；留空 = _）" "${server_name}")
  fi

  append_override "${overrides_file}" "PORT" "${port}"
  append_override "${overrides_file}" "NODE_ENV" "${node_env}"
  append_override "${overrides_file}" "LOG_LEVEL" "${log_level}"
  append_override "${overrides_file}" "CORS_ORIGIN" "${cors_origin}"
  append_override "${overrides_file}" "SSE_HEARTBEAT_INTERVAL" "${heartbeat}"
  append_override "${overrides_file}" "SERVER_NAME" "${server_name}"

  # ── 前端 Vite 设置 ──
  local vite_backend_url vite_character_provider vite_live2d_model_id
  local vite_live2d_max_dpr vite_live2d_target_fps vite_rive_src vite_rive_state_machine
  vite_backend_url=$(resolve_example "VITE_BACKEND_URL" "${existing_file}" "VITE_BACKEND_URL")
  vite_character_provider=$(resolve_example "VITE_CHARACTER_PROVIDER" "${existing_file}" "VITE_CHARACTER_PROVIDER")
  vite_live2d_model_id=$(resolve_example "VITE_LIVE2D_MODEL_ID" "${existing_file}" "VITE_LIVE2D_MODEL_ID")
  vite_live2d_max_dpr=$(resolve_example "VITE_LIVE2D_MAX_DPR" "${existing_file}" "VITE_LIVE2D_MAX_DPR")
  vite_live2d_target_fps=$(resolve_example "VITE_LIVE2D_TARGET_FPS" "${existing_file}" "VITE_LIVE2D_TARGET_FPS")
  vite_rive_src=$(resolve_example "VITE_RIVE_SRC" "${existing_file}" "VITE_RIVE_SRC")
  vite_rive_state_machine=$(resolve_example "VITE_RIVE_STATE_MACHINE" "${existing_file}" "VITE_RIVE_STATE_MACHINE")

  if ! $noninteractive; then
    vite_character_provider=$(prompt "角色渲染 (live2d/rive)" "${vite_character_provider}")
    vite_backend_url=$(prompt "VITE_BACKEND_URL（deploy 留空走 gateway）" "${vite_backend_url}")
    if [ "${vite_character_provider}" = "live2d" ]; then
      vite_live2d_model_id=$(prompt "VITE_LIVE2D_MODEL_ID（留空使用默认）" "${vite_live2d_model_id}")
      vite_live2d_max_dpr=$(prompt "VITE_LIVE2D_MAX_DPR" "${vite_live2d_max_dpr}")
      vite_live2d_target_fps=$(prompt "VITE_LIVE2D_TARGET_FPS" "${vite_live2d_target_fps}")
    else
      vite_rive_src=$(prompt "VITE_RIVE_SRC" "${vite_rive_src}")
      vite_rive_state_machine=$(prompt "VITE_RIVE_STATE_MACHINE" "${vite_rive_state_machine}")
    fi
  fi

  append_override "${overrides_file}" "VITE_BACKEND_URL" "${vite_backend_url}"
  append_override "${overrides_file}" "VITE_CHARACTER_PROVIDER" "${vite_character_provider}"
  append_override "${overrides_file}" "VITE_LIVE2D_MODEL_ID" "${vite_live2d_model_id}"
  append_override "${overrides_file}" "VITE_LIVE2D_MAX_DPR" "${vite_live2d_max_dpr}"
  append_override "${overrides_file}" "VITE_LIVE2D_TARGET_FPS" "${vite_live2d_target_fps}"
  append_override "${overrides_file}" "VITE_RIVE_SRC" "${vite_rive_src}"
  append_override "${overrides_file}" "VITE_RIVE_STATE_MACHINE" "${vite_rive_state_machine}"

  # ── LLM 详细配置 ──
  local deepseek_api_key deepseek_base_url deepseek_model
  local openai_api_key openai_base_url openai_model
  local xiaomi_api_key xiaomi_base_url xiaomi_model
  local volcengine_llm_api_key volcengine_llm_base_url volcengine_llm_model

  deepseek_api_key=$(resolve_example "DEEPSEEK_API_KEY" "${existing_file}" "DEEPSEEK_API_KEY")
  deepseek_base_url=$(resolve_example "DEEPSEEK_BASE_URL" "${existing_file}" "DEEPSEEK_BASE_URL")
  deepseek_model=$(resolve_example "DEEPSEEK_MODEL" "${existing_file}" "DEEPSEEK_MODEL")

  openai_api_key=$(resolve_example "OPENAI_API_KEY" "${existing_file}" "OPENAI_API_KEY")
  openai_base_url=$(resolve_example "OPENAI_BASE_URL" "${existing_file}" "OPENAI_BASE_URL")
  openai_model=$(resolve_example "OPENAI_MODEL" "${existing_file}" "OPENAI_MODEL")

  xiaomi_api_key=$(resolve_example "XIAOMI_API_KEY" "${existing_file}" "XIAOMI_API_KEY")
  xiaomi_base_url=$(resolve_example "XIAOMI_BASE_URL" "${existing_file}" "XIAOMI_BASE_URL")
  xiaomi_model=$(resolve_example "XIAOMI_MODEL" "${existing_file}" "XIAOMI_MODEL")

  volcengine_llm_api_key=$(resolve_example "VOLCENGINE_LLM_API_KEY" "${existing_file}" "VOLCENGINE_LLM_API_KEY")
  volcengine_llm_base_url=$(resolve_example "VOLCENGINE_LLM_BASE_URL" "${existing_file}" "VOLCENGINE_LLM_BASE_URL")
  volcengine_llm_model=$(resolve_example "VOLCENGINE_LLM_MODEL" "${existing_file}" "VOLCENGINE_LLM_MODEL")

  case "${llm_provider}" in
    deepseek)
      if ! $noninteractive; then
        deepseek_api_key=$(prompt_secret "DeepSeek API Key（输入不回显）" "${deepseek_api_key}")
        deepseek_base_url=$(prompt "DeepSeek Base URL" "${deepseek_base_url}")
        deepseek_model=$(prompt "DeepSeek Model" "${deepseek_model}")
      fi
      ;;
    openai)
      if ! $noninteractive; then
        openai_api_key=$(prompt_secret "OpenAI API Key（输入不回显）" "${openai_api_key}")
        openai_base_url=$(prompt "OpenAI Base URL" "${openai_base_url}")
        openai_model=$(prompt "OpenAI Model" "${openai_model}")
      fi
      ;;
    xiaomi)
      if ! $noninteractive; then
        xiaomi_api_key=$(prompt_secret "Xiaomi LLM API Key（输入不回显）" "${xiaomi_api_key}")
        xiaomi_base_url=$(prompt "Xiaomi LLM Base URL" "${xiaomi_base_url}")
        xiaomi_model=$(prompt "Xiaomi LLM Model" "${xiaomi_model}")
      fi
      ;;
    volcengine)
      if ! $noninteractive; then
        volcengine_llm_api_key=$(prompt_secret "Volcengine LLM API Key（火山方舟，输入不回显）" "${volcengine_llm_api_key}")
        volcengine_llm_base_url=$(prompt "Volcengine LLM Base URL" "${volcengine_llm_base_url}")
        volcengine_llm_model=$(prompt "Volcengine LLM Model（推理接入点 ID，如 ep-xxxxxxxxxxxxx）" "${volcengine_llm_model}")
      fi
      if [ -z "${volcengine_llm_api_key}" ]; then
        log_warn "Volcengine LLM API Key 为空，后端初始化可能失败"
      fi
      if [ -z "${volcengine_llm_model}" ]; then
        log_warn "Volcengine LLM Model（接入点 ID）为空，后端初始化可能失败"
      fi
      ;;
    mock)
      ;;
    *)
      log_error "不支持的 LLM 厂商: ${llm_provider}"
      rm -f "${overrides_file}"
      return 1
      ;;
  esac

  append_override "${overrides_file}" "DEEPSEEK_API_KEY" "${deepseek_api_key}"
  append_override "${overrides_file}" "DEEPSEEK_BASE_URL" "${deepseek_base_url}"
  append_override "${overrides_file}" "DEEPSEEK_MODEL" "${deepseek_model}"
  append_override "${overrides_file}" "OPENAI_API_KEY" "${openai_api_key}"
  append_override "${overrides_file}" "OPENAI_BASE_URL" "${openai_base_url}"
  append_override "${overrides_file}" "OPENAI_MODEL" "${openai_model}"
  append_override "${overrides_file}" "XIAOMI_API_KEY" "${xiaomi_api_key}"
  append_override "${overrides_file}" "XIAOMI_BASE_URL" "${xiaomi_base_url}"
  append_override "${overrides_file}" "XIAOMI_MODEL" "${xiaomi_model}"
  append_override "${overrides_file}" "VOLCENGINE_LLM_API_KEY" "${volcengine_llm_api_key}"
  append_override "${overrides_file}" "VOLCENGINE_LLM_BASE_URL" "${volcengine_llm_base_url}"
  append_override "${overrides_file}" "VOLCENGINE_LLM_MODEL" "${volcengine_llm_model}"

  # ── TTS 详细配置 ──
  local volcengine_tts_api_key volcengine_tts_resource_id volcengine_tts_base_url
  local volcengine_tts_speaker volcengine_tts_format volcengine_tts_sample_rate
  local xiaomi_tts_api_key xiaomi_tts_base_url xiaomi_tts_mode xiaomi_tts_voice
  local xiaomi_tts_voice_clone xiaomi_tts_voice_design
  local cosyvoice_base_url cosyvoice_spk_id cosyvoice_speed cosyvoice_sample_rate
  local cosyvoice_health_check

  volcengine_tts_api_key=$(resolve_example "VOLCENGINE_TTS_API_KEY" "${existing_file}" "VOLCENGINE_TTS_API_KEY")
  volcengine_tts_resource_id=$(resolve_example "VOLCENGINE_TTS_RESOURCE_ID" "${existing_file}" "VOLCENGINE_TTS_RESOURCE_ID")
  volcengine_tts_base_url=$(resolve_example "VOLCENGINE_TTS_BASE_URL" "${existing_file}" "VOLCENGINE_TTS_BASE_URL")
  volcengine_tts_speaker=$(resolve_example "VOLCENGINE_TTS_SPEAKER" "${existing_file}" "VOLCENGINE_TTS_SPEAKER")
  volcengine_tts_format=$(resolve_example "VOLCENGINE_TTS_FORMAT" "${existing_file}" "VOLCENGINE_TTS_FORMAT")
  volcengine_tts_sample_rate=$(resolve_example "VOLCENGINE_TTS_SAMPLE_RATE" "${existing_file}" "VOLCENGINE_TTS_SAMPLE_RATE")

  xiaomi_tts_api_key=$(resolve_example "XIAOMI_TTS_API_KEY" "${existing_file}" "XIAOMI_TTS_API_KEY")
  xiaomi_tts_base_url=$(resolve_example "XIAOMI_TTS_BASE_URL" "${existing_file}" "XIAOMI_TTS_BASE_URL")
  xiaomi_tts_mode=$(resolve_example "XIAOMI_TTS_MODE" "${existing_file}" "XIAOMI_TTS_MODE")
  xiaomi_tts_voice=$(resolve_example "XIAOMI_TTS_VOICE" "${existing_file}" "XIAOMI_TTS_VOICE")
  xiaomi_tts_voice_clone=$(resolve_example "XIAOMI_TTS_VOICE_CLONE" "${existing_file}" "XIAOMI_TTS_VOICE_CLONE")
  xiaomi_tts_voice_design=$(resolve_example "XIAOMI_TTS_VOICE_DESIGN" "${existing_file}" "XIAOMI_TTS_VOICE_DESIGN")

  cosyvoice_base_url=$(resolve_example "COSYVOICE_BASE_URL" "${existing_file}" "COSYVOICE_BASE_URL")
  cosyvoice_spk_id=$(resolve_example "COSYVOICE_SPK_ID" "${existing_file}" "COSYVOICE_SPK_ID")
  cosyvoice_speed=$(resolve_example "COSYVOICE_SPEED" "${existing_file}" "COSYVOICE_SPEED")
  cosyvoice_sample_rate=$(resolve_example "COSYVOICE_SAMPLE_RATE" "${existing_file}" "COSYVOICE_SAMPLE_RATE")
  cosyvoice_health_check=$(resolve_example "COSYVOICE_HEALTH_CHECK" "${existing_file}" "COSYVOICE_HEALTH_CHECK")

  case "${tts_provider}" in
    browser)
      log_info "TTS=browser：前端走浏览器 SpeechSynthesis，后端不合成"
      ;;
    volcengine)
      if ! $noninteractive; then
        volcengine_tts_api_key=$(prompt_secret "Volcengine TTS API Key（输入不回显）" "${volcengine_tts_api_key}")
        volcengine_tts_resource_id=$(prompt "Volcengine TTS Resource ID" "${volcengine_tts_resource_id}")
        volcengine_tts_speaker=$(prompt "Volcengine TTS Speaker" "${volcengine_tts_speaker}")
        volcengine_tts_format=$(prompt "Volcengine TTS Format" "${volcengine_tts_format}")
        volcengine_tts_sample_rate=$(prompt "Volcengine TTS Sample Rate" "${volcengine_tts_sample_rate}")
      fi
      if [ -z "${volcengine_tts_api_key}" ]; then
        log_warn "Volcengine TTS API Key 为空，后端初始化可能失败"
      fi
      ;;
    xiaomi)
      if ! $noninteractive; then
        xiaomi_tts_api_key=$(prompt_secret "Xiaomi TTS API Key（输入不回显）" "${xiaomi_tts_api_key}")
        xiaomi_tts_base_url=$(prompt "Xiaomi TTS Base URL" "${xiaomi_tts_base_url}")
        xiaomi_tts_mode=$(prompt "Xiaomi TTS 模式 (preset/voicedesign/voiceclone)" "${xiaomi_tts_mode}")
        xiaomi_tts_voice=$(prompt "Xiaomi TTS Voice（preset 模式音色名）" "${xiaomi_tts_voice}")
      fi
      ;;
    cosyvoice)
      GENERATED_ENABLE_COSYVOICE=true
      if $noninteractive; then
        log_warn "TTS=cosyvoice：非交互模式下自动启用 cosyvoice 叠加，请确认服务器具备 GPU"
      else
        log_warn "CosyVoice 需 GPU，且需用 docker-compose.cosyvoice.yml 叠加部署"
        if ! prompt_yes_no "服务器是否已具备 GPU + cosyvoice:local 镜像"; then
          log_warn "未确认 GPU，TTS 自动切换为 browser"
          tts_provider="browser"
          append_override "${overrides_file}" "TTS_PROVIDER" "${tts_provider}"
          GENERATED_ENABLE_COSYVOICE=false
        fi
      fi
      ;;
    *)
      log_error "不支持的 TTS 厂商: ${tts_provider}"
      rm -f "${overrides_file}"
      return 1
      ;;
  esac

  append_override "${overrides_file}" "VOLCENGINE_TTS_API_KEY" "${volcengine_tts_api_key}"
  append_override "${overrides_file}" "VOLCENGINE_TTS_RESOURCE_ID" "${volcengine_tts_resource_id}"
  append_override "${overrides_file}" "VOLCENGINE_TTS_BASE_URL" "${volcengine_tts_base_url}"
  append_override "${overrides_file}" "VOLCENGINE_TTS_SPEAKER" "${volcengine_tts_speaker}"
  append_override "${overrides_file}" "VOLCENGINE_TTS_FORMAT" "${volcengine_tts_format}"
  append_override "${overrides_file}" "VOLCENGINE_TTS_SAMPLE_RATE" "${volcengine_tts_sample_rate}"
  append_override "${overrides_file}" "XIAOMI_TTS_API_KEY" "${xiaomi_tts_api_key}"
  append_override "${overrides_file}" "XIAOMI_TTS_BASE_URL" "${xiaomi_tts_base_url}"
  append_override "${overrides_file}" "XIAOMI_TTS_MODE" "${xiaomi_tts_mode}"
  append_override "${overrides_file}" "XIAOMI_TTS_VOICE" "${xiaomi_tts_voice}"
  append_override "${overrides_file}" "XIAOMI_TTS_VOICE_CLONE" "${xiaomi_tts_voice_clone}"
  append_override "${overrides_file}" "XIAOMI_TTS_VOICE_DESIGN" "${xiaomi_tts_voice_design}"
  append_override "${overrides_file}" "COSYVOICE_BASE_URL" "${cosyvoice_base_url}"
  append_override "${overrides_file}" "COSYVOICE_SPK_ID" "${cosyvoice_spk_id}"
  append_override "${overrides_file}" "COSYVOICE_SPEED" "${cosyvoice_speed}"
  append_override "${overrides_file}" "COSYVOICE_SAMPLE_RATE" "${cosyvoice_sample_rate}"
  append_override "${overrides_file}" "COSYVOICE_HEALTH_CHECK" "${cosyvoice_health_check}"

  # ── ASR 详细配置 ──
  local volcengine_asr_api_key volcengine_asr_resource_id volcengine_asr_base_url
  local volcengine_asr_segment_ms xiaomi_asr_api_key xiaomi_asr_base_url
  local xiaomi_asr_model whisper_base_url whisper_model

  volcengine_asr_api_key=$(resolve_example "VOLCENGINE_ASR_API_KEY" "${existing_file}" "VOLCENGINE_ASR_API_KEY")
  volcengine_asr_resource_id=$(resolve_example "VOLCENGINE_ASR_RESOURCE_ID" "${existing_file}" "VOLCENGINE_ASR_RESOURCE_ID")
  volcengine_asr_base_url=$(resolve_example "VOLCENGINE_ASR_BASE_URL" "${existing_file}" "VOLCENGINE_ASR_BASE_URL")
  volcengine_asr_segment_ms=$(resolve_example "VOLCENGINE_ASR_SEGMENT_MS" "${existing_file}" "VOLCENGINE_ASR_SEGMENT_MS")

  xiaomi_asr_api_key=$(resolve_example "XIAOMI_ASR_API_KEY" "${existing_file}" "XIAOMI_ASR_API_KEY")
  xiaomi_asr_base_url=$(resolve_example "XIAOMI_ASR_BASE_URL" "${existing_file}" "XIAOMI_ASR_BASE_URL")
  xiaomi_asr_model=$(resolve_example "XIAOMI_ASR_MODEL" "${existing_file}" "XIAOMI_ASR_MODEL")

  whisper_base_url=$(resolve_example "WHISPER_BASE_URL" "${existing_file}" "WHISPER_BASE_URL")
  whisper_model=$(resolve_example "WHISPER_MODEL" "${existing_file}" "WHISPER_MODEL")

  case "${asr_provider}" in
    browser)
      log_info "ASR=browser：前端浏览器识别，无需 whisper 容器"
      ;;
    whisper)
      GENERATED_ENABLE_WHISPER=true
      log_warn "ASR=whisper：将以 -f docker-compose.whisper.yml 叠加启动 whisper.cpp 容器"
      ;;
    xiaomi)
      if ! $noninteractive; then
        xiaomi_asr_api_key=$(prompt_secret "Xiaomi ASR API Key（输入不回显；留空回退到 LLM key）" "${xiaomi_asr_api_key}")
        xiaomi_asr_base_url=$(prompt "Xiaomi ASR Base URL" "${xiaomi_asr_base_url}")
        xiaomi_asr_model=$(prompt "Xiaomi ASR Model" "${xiaomi_asr_model}")
      fi
      ;;
    volcengine)
      if ! $noninteractive; then
        volcengine_asr_api_key=$(prompt_secret "Volcengine ASR API Key（留空则回退到 TTS key，输入不回显）" "${volcengine_asr_api_key}")
        volcengine_asr_resource_id=$(prompt "Volcengine ASR Resource ID" "${volcengine_asr_resource_id}")
      fi
      ;;
    *)
      log_error "不支持的 ASR 厂商: ${asr_provider}"
      rm -f "${overrides_file}"
      return 1
      ;;
  esac

  append_override "${overrides_file}" "VOLCENGINE_ASR_API_KEY" "${volcengine_asr_api_key}"
  append_override "${overrides_file}" "VOLCENGINE_ASR_RESOURCE_ID" "${volcengine_asr_resource_id}"
  append_override "${overrides_file}" "VOLCENGINE_ASR_BASE_URL" "${volcengine_asr_base_url}"
  append_override "${overrides_file}" "VOLCENGINE_ASR_SEGMENT_MS" "${volcengine_asr_segment_ms}"
  append_override "${overrides_file}" "XIAOMI_ASR_API_KEY" "${xiaomi_asr_api_key}"
  append_override "${overrides_file}" "XIAOMI_ASR_BASE_URL" "${xiaomi_asr_base_url}"
  append_override "${overrides_file}" "XIAOMI_ASR_MODEL" "${xiaomi_asr_model}"
  append_override "${overrides_file}" "WHISPER_BASE_URL" "${whisper_base_url}"
  append_override "${overrides_file}" "WHISPER_MODEL" "${whisper_model}"

  # ── 通用语音参数 ──
  local tts_format tts_speed asr_language max_audio_size_mb
  tts_format=$(resolve_example "TTS_FORMAT" "${existing_file}" "TTS_FORMAT")
  tts_speed=$(resolve_example "TTS_SPEED" "${existing_file}" "TTS_SPEED")
  asr_language=$(resolve_example "ASR_LANGUAGE" "${existing_file}" "ASR_LANGUAGE")
  max_audio_size_mb=$(resolve_example "MAX_AUDIO_SIZE_MB" "${existing_file}" "MAX_AUDIO_SIZE_MB")

  append_override "${overrides_file}" "TTS_FORMAT" "${tts_format}"
  append_override "${overrides_file}" "TTS_SPEED" "${tts_speed}"
  append_override "${overrides_file}" "ASR_LANGUAGE" "${asr_language}"
  append_override "${overrides_file}" "MAX_AUDIO_SIZE_MB" "${max_audio_size_mb}"

  # ── 数据目录与缓存 ──
  # 仅当生成生产部署配置（路径为 .../data/.env）时，显式写入 /app/data。
  # 本地 dev 配置（如仓库根 .env）留空，让 config.ts 使用 <repo>/.dev-data。
  local data_dir db_path config_dir tts_cache_dir
  local tts_cache_max_mb tts_cache_max_files
  local is_deploy_env=false
  case "${output_file}" in
    */data/.env) is_deploy_env=true ;;
  esac

  if ${is_deploy_env}; then
    data_dir=$(resolve_example "DATA_DIR" "${existing_file}" "DATA_DIR")
    db_path=$(resolve_example "DB_PATH" "${existing_file}" "DB_PATH")
    config_dir=$(resolve_example "CONFIG_DIR" "${existing_file}" "CONFIG_DIR")
    tts_cache_dir=$(resolve_example "TTS_CACHE_DIR" "${existing_file}" "TTS_CACHE_DIR")
  else
    data_dir=""
    db_path=""
    config_dir=""
    tts_cache_dir=""
  fi
  tts_cache_max_mb=$(resolve_example "TTS_CACHE_MAX_MB" "${existing_file}" "TTS_CACHE_MAX_MB")
  tts_cache_max_files=$(resolve_example "TTS_CACHE_MAX_FILES" "${existing_file}" "TTS_CACHE_MAX_FILES")

  [ -n "${data_dir}" ] && append_override "${overrides_file}" "DATA_DIR" "${data_dir}"
  [ -n "${db_path}" ] && append_override "${overrides_file}" "DB_PATH" "${db_path}"
  [ -n "${config_dir}" ] && append_override "${overrides_file}" "CONFIG_DIR" "${config_dir}"
  [ -n "${tts_cache_dir}" ] && append_override "${overrides_file}" "TTS_CACHE_DIR" "${tts_cache_dir}"
  append_override "${overrides_file}" "TTS_CACHE_MAX_MB" "${tts_cache_max_mb}"
  append_override "${overrides_file}" "TTS_CACHE_MAX_FILES" "${tts_cache_max_files}"

  # ── 句型池 ──
  local line_pool_dir line_pool_max_lines line_pool_inject_limit
  if ${is_deploy_env}; then
    line_pool_dir=$(resolve_example "LINE_POOL_DIR" "${existing_file}" "LINE_POOL_DIR")
  else
    line_pool_dir=""
  fi
  line_pool_max_lines=$(resolve_example "LINE_POOL_MAX_LINES" "${existing_file}" "LINE_POOL_MAX_LINES")
  line_pool_inject_limit=$(resolve_example "LINE_POOL_INJECT_LIMIT" "${existing_file}" "LINE_POOL_INJECT_LIMIT")

  [ -n "${line_pool_dir}" ] && append_override "${overrides_file}" "LINE_POOL_DIR" "${line_pool_dir}"
  append_override "${overrides_file}" "LINE_POOL_MAX_LINES" "${line_pool_max_lines}"
  append_override "${overrides_file}" "LINE_POOL_INJECT_LIMIT" "${line_pool_inject_limit}"

  # ── 渲染最终 .env ──
  if ! render_env "${template_file}" "${output_file}" "${overrides_file}"; then
    log_error ".env 渲染失败"
    rm -f "${overrides_file}"
    return 1
  fi

  rm -f "${overrides_file}"

  # ── 校验并备份 last-known-good ──
  if command -v validate_env >/dev/null 2>&1; then
    if validate_env "${output_file}"; then
      # 仅正式部署 .env（*/data/.env）才写 last-known-good 备份；
      # 临时文件（如 .env.deploy.generated）跳过，避免含 key 的备份残留在仓库根
      if ${is_deploy_env}; then
        cp "${output_file}" "$(dirname "${output_file}")/.env.last-known-good"
      fi
    else
      log_warn ".env 校验发现必填项缺失，已跳过 last-known-good 备份"
    fi
  else
    log_warn "validate_env 未加载，跳过校验"
  fi

  log_info "已生成 .env: ${output_file}"
}
