#!/usr/bin/env bash
# AI English Tutor —— 单 key 增量修改 .env
#
# 用法：
#   pnpm run setup:set -- KEY=VALUE
#   pnpm run setup:set -- KEY=VALUE --file /path/to/.env
#
# 行为：
#   1. 备份当前 .env。
#   2. 修改或新增指定 KEY。
#   3. 调用 validate-env.sh 校验。
#   4. 校验通过则更新 .env.last-known-good；失败则回滚备份。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
NC=$'\033[0m'

log_info()  { echo "${GREEN}[INFO]${NC} $*"; }
log_warn()  { echo "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo "${RED}[ERROR]${NC} $*" >&2; }

AI_TUTOR_HOME="${AI_TUTOR_HOME:-$HOME/.ai-english-tutor}"
ENV_FILE="${AI_TUTOR_HOME}/data/.env"

usage() {
  cat <<EOF
用法:
  pnpm run setup:set -- KEY=VALUE
  pnpm run setup:set -- KEY=VALUE --file /path/to/.env

选项:
  --file PATH   指定 .env 文件路径（默认: \${AI_TUTOR_HOME}/data/.env）
  -h, --help    显示本帮助
EOF
}

# 解析参数
KV_ARG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --file) ENV_FILE="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *)
      if [ -z "${KV_ARG}" ]; then
        KV_ARG="$1"
        shift
      else
        log_error "未知参数或多余的 key=value: $1"
        usage
        exit 1
      fi
      ;;
  esac
done

if [ -z "${KV_ARG}" ]; then
  log_error "请提供 KEY=VALUE"
  usage
  exit 1
fi

if [[ ! "${KV_ARG}" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
  log_error "参数格式错误，应为 KEY=VALUE: ${KV_ARG}"
  exit 1
fi

KEY="${KV_ARG%%=*}"
VALUE="${KV_ARG#*=}"

if [ ! -f "${ENV_FILE}" ]; then
  log_error "找不到 .env 文件: ${ENV_FILE}"
  log_info "可先运行: pnpm run setup"
  exit 1
fi

log_info "修改 ${ENV_FILE}: ${KEY}"

# 备份
BACKUP_FILE="${ENV_FILE}.bak.$(date +%Y%m%d-%H%M%S)"
cp "${ENV_FILE}" "${BACKUP_FILE}"

# 还原函数
restore_backup() {
  cp "${BACKUP_FILE}" "${ENV_FILE}"
  log_info "已回滚到备份: ${BACKUP_FILE}"
}

# 修改或新增 key
TMP_FILE=$(mktemp)
REPLACED=false

while IFS= read -r line || [ -n "${line}" ]; do
  if [[ "${line}" =~ ^${KEY}= ]] || [[ "${line}" =~ ^#[[:space:]]*${KEY}= ]]; then
    echo "${KEY}=${VALUE}" >> "${TMP_FILE}"
    REPLACED=true
  else
    echo "${line}" >> "${TMP_FILE}"
  fi
done < "${ENV_FILE}"

if ! ${REPLACED}; then
  echo "" >> "${TMP_FILE}"
  echo "# 由 setup:set 追加" >> "${TMP_FILE}"
  echo "${KEY}=${VALUE}" >> "${TMP_FILE}"
fi

mv "${TMP_FILE}" "${ENV_FILE}"

# 校验
if bash "${PROJECT_ROOT}/scripts/config/validate.sh" --strict "${ENV_FILE}"; then
  cp "${ENV_FILE}" "$(dirname "${ENV_FILE}")/.env.last-known-good"
  log_info "校验通过，已更新 last-known-good"
  rm -f "${BACKUP_FILE}"
else
  log_error "校验失败，执行回滚"
  restore_backup
  rm -f "${BACKUP_FILE}"
  exit 1
fi

exit 0
