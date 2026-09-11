#!/usr/bin/env bash
# AI English Tutor — 交互式配置向导
# 用法：
#   bash scripts/config/setup.sh              # 交互模式
#   bash scripts/config/setup.sh --yes        # 非交互模式，使用环境变量/默认值
#   bash scripts/config/setup.sh --validate-only [.env]
#   bash scripts/config/setup.sh --restore-last-known-good [.env]
#
# 生成 ~/.ai-english-tutor/data/.env 并初始化数据目录，供 docker compose 部署使用。

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
source "${PROJECT_ROOT}/scripts/config/lib/render-env.sh"
source "${PROJECT_ROOT}/scripts/config/lib/setup-env.sh"
source "${PROJECT_ROOT}/scripts/config/validate.sh"

AUTO_YES=false
VALIDATE_ONLY=false
RESTORE_LKG=false
AI_TUTOR_HOME="${AI_TUTOR_HOME:-$HOME/.ai-english-tutor}"
ENV_FILE_OVERRIDE=""

show_help() {
  cat <<EOF
AI English Tutor — 交互式配置向导

用法:
  bash scripts/config/setup.sh [选项] [.env 文件路径]
  pnpm run setup -- [选项]

选项:
  -y, --yes                    非交互模式，使用环境变量或默认值
  --validate-only [PATH]       仅校验 .env，不生成；默认 \${AI_TUTOR_HOME}/data/.env
  --restore-last-known-good [PATH]
                               回滚到上一份校验通过的 .env.last-known-good
  -h, --help                   显示本帮助

环境变量（非交互模式下常用）:
  AI_TUTOR_HOME          数据目录，默认 ~/.ai-english-tutor
  LLM_PROVIDER           volcengine/deepseek/xiaomi/openai/mock
  VOLCENGINE_LLM_API_KEY / VOLCENGINE_LLM_BASE_URL / VOLCENGINE_LLM_MODEL
  DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL / DEEPSEEK_MODEL
  OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL
  XIAOMI_API_KEY / XIAOMI_BASE_URL / XIAOMI_MODEL
  TTS_PROVIDER           browser/volcengine/xiaomi/cosyvoice
  ASR_PROVIDER           browser/volcengine/whisper/xiaomi
  CORS_ORIGIN, LOG_LEVEL, SSE_HEARTBEAT_INTERVAL, SERVER_NAME
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -y|--yes) AUTO_YES=true ;;
      --validate-only) VALIDATE_ONLY=true ;;
      --restore-last-known-good) RESTORE_LKG=true ;;
      -h|--help) show_help; exit 0 ;;
      *)
        if [ -z "${ENV_FILE_OVERRIDE}" ]; then
          ENV_FILE_OVERRIDE="$1"
        else
          log_error "未知参数或多余的文件路径: $1"; show_help; exit 1
        fi
        ;;
    esac
    shift
  done
}

is_interactive() {
  [ -t 0 ] && [ -t 1 ]
}

# 询问数据目录，支持默认值和绝对路径校验
configure_home_dir() {
  local input
  if $AUTO_YES; then
    log_info "非交互模式，数据目录: ${AI_TUTOR_HOME}"
  else
    input=$(prompt "数据目录（运行时数据/模型都放这里）" "${AI_TUTOR_HOME}")
    AI_TUTOR_HOME="${input%/}"
  fi

  if [ -z "${AI_TUTOR_HOME}" ]; then
    log_error "数据目录不能为空"
    exit 1
  fi
  case "${AI_TUTOR_HOME}" in
    /* | "$HOME"/* | ~/*) ;;
    *) log_error "数据目录必须是绝对路径（以 / 开头）: ${AI_TUTOR_HOME}"; exit 1 ;;
  esac

  # 展开 ~ 为 $HOME（避免后续字符串处理中 ~ 不展开）
  AI_TUTOR_HOME="${AI_TUTOR_HOME/#\~/$HOME}"
}

detect_shell_profile() {
  local shell_name
  shell_name="$(basename "${SHELL:-bash}")"
  case "${shell_name}" in
    zsh)  echo "${HOME}/.zshrc" ;;
    bash) echo "${HOME}/.bashrc" ;;
    *)    echo "${HOME}/.${shell_name}rc" ;;
  esac
}

write_shell_profile_export() {
  local home_dir="$1"
  local profile
  profile=$(detect_shell_profile)
  local line="export AI_TUTOR_HOME=${home_dir}"

  if [ -f "${profile}" ] && grep -qF "${line}" "${profile}"; then
    log_info "AI_TUTOR_HOME 已写入 ${profile}，跳过"
    return 0
  fi

  echo "${line}" >> "${profile}"
  log_info "已将 AI_TUTOR_HOME 写入 ${profile}"
  log_info "  ${line}"
}

print_next_steps() {
  local env_file="${AI_TUTOR_HOME}/data/.env"

  echo ""
  echo "================ 配置完成 ================"
  echo "数据目录:   ${AI_TUTOR_HOME}"
  echo "环境文件:   ${env_file}"
  echo ""
  echo "启动命令:"
  echo "  export AI_TUTOR_HOME=${AI_TUTOR_HOME}"

  local compose_files="-f docker-compose.yml"
  if [ "${GENERATED_ENABLE_WHISPER:-false}" = "true" ]; then
    compose_files="${compose_files} -f docker-compose.whisper.yml"
  fi
  if [ "${GENERATED_ENABLE_COSYVOICE:-false}" = "true" ]; then
    compose_files="${compose_files} -f docker-compose.cosyvoice.yml"
  fi
  echo "  docker compose ${compose_files} up --build -d"

  if [ "${GENERATED_ENABLE_WHISPER:-false}" = "true" ]; then
    echo ""
    echo "注意: ASR=whisper，首次启动会自动下载模型（~150MB），可能需要科学上网。"
  fi
  if [ "${GENERATED_ENABLE_COSYVOICE:-false}" = "true" ]; then
    echo ""
    echo "注意: TTS=cosyvoice，需要服务器具备 GPU，否则容器会启动失败。"
  fi
  echo "=========================================="
}

# 仅校验模式
run_validate_only() {
  local env_file="${ENV_FILE_OVERRIDE:-${AI_TUTOR_HOME}/data/.env}"
  if [ ! -f "${env_file}" ]; then
    log_error "找不到 .env 文件: ${env_file}"
    exit 1
  fi
  validate_env "${env_file}"
}

# 回滚到 last-known-good
run_restore_last_known_good() {
  local env_file="${ENV_FILE_OVERRIDE:-${AI_TUTOR_HOME}/data/.env}"
  local lkg_file="$(dirname "${env_file}")/.env.last-known-good"

  if [ ! -f "${lkg_file}" ]; then
    log_error "找不到 last-known-good 文件: ${lkg_file}"
    exit 1
  fi

  local backup_file="${env_file}.bak.$(date +%Y%m%d-%H%M%S)"
  cp "${env_file}" "${backup_file}"
  cp "${lkg_file}" "${env_file}"
  log_info "已回滚 ${env_file} 到 last-known-good"
  log_info "当前配置已备份: ${backup_file}"

  validate_env "${env_file}"
}

main() {
  parse_args "$@"

  if ${VALIDATE_ONLY}; then
    run_validate_only
    exit 0
  fi

  if ${RESTORE_LKG}; then
    run_restore_last_known_good
    exit 0
  fi

  if ! $AUTO_YES && ! is_interactive; then
    log_warn "未检测到 TTY，自动进入 --yes 模式"
    AUTO_YES=true
  fi

  # 1. 数据目录
  configure_home_dir
  local data_dir="${AI_TUTOR_HOME}/data"
  local env_file="${ENV_FILE_OVERRIDE:-${data_dir}/.env}"

  # 2. 导出给 docker-compose 和 init-host-dir 使用
  export AI_TUTOR_HOME

  # 3. 初始化目录
  log_info "初始化数据目录..."
  if $AUTO_YES; then
    bash "${PROJECT_ROOT}/scripts/config/init-host.sh" --skip-mkcert "${AI_TUTOR_HOME}"
  else
    bash "${PROJECT_ROOT}/scripts/config/init-host.sh" "${AI_TUTOR_HOME}"
  fi

  # 4. 生成/更新 .env
  if [ -f "${env_file}" ]; then
    if $AUTO_YES; then
      # 非交互模式下：若 .env 仍与模板完全一致，则视为首次配置，自动重新生成
      if diff -q "${env_file}" "${PROJECT_ROOT}/.env.example" >/dev/null 2>&1; then
        local backup_file="${env_file}.bak.$(date +%Y%m%d-%H%M%S)"
        cp "${env_file}" "${backup_file}"
        log_info ".env 仍为模板，已备份并准备重新生成: ${backup_file}"
        generate_env "${env_file}" "" true
      else
        log_info "已存在 ${env_file} 且已被编辑，--yes 模式下保留"
        validate_env "${env_file}" || true
      fi
    elif prompt_yes_no "${env_file} 已存在，是否重新交互式配置（默认值=现有配置，回车保留；N=保留）"; then
      local backup_file="${env_file}.bak.$(date +%Y%m%d-%H%M%S)"
      cp "${env_file}" "${backup_file}"
      log_info "已备份: ${backup_file}"
      generate_env "${env_file}" "${env_file}" false
    else
      log_info "保留现有 ${env_file}"
      validate_env "${env_file}" || true
    fi
  else
    generate_env "${env_file}" "${env_file}" $AUTO_YES
  fi

  # 5. 持久化 AI_TUTOR_HOME（仅交互模式）
  if ! $AUTO_YES; then
    if prompt_yes_no "是否将 AI_TUTOR_HOME 写入 shell profile（推荐，否则每次新终端需手动 export）"; then
      write_shell_profile_export "${AI_TUTOR_HOME}"
    fi
  else
    log_info "请手动执行：export AI_TUTOR_HOME=${AI_TUTOR_HOME}"
  fi

  # 6. 下一步提示
  print_next_steps
}

main "$@"
