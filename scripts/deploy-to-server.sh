#!/usr/bin/env bash
# AI English Tutor — 一键部署到服务器
# 用法: ./scripts/deploy-to-server.sh
#
# 流程: git clean → ssh 检查 → 交互式 .env → rsync → docker compose up → 健康检查 → 报告
# 默认最小栈: 浏览器 ASR/TTS + DeepSeek LLM；需要时自动叠加 whisper / cosyvoice compose。

set -euo pipefail

USE_LOCAL_ENV=false

if [[ $# -gt 0 ]]; then
  case "$1" in
    -h|--help) sed -n '2,5p' "$0"; exit 0 ;;
    --use-local-env) USE_LOCAL_ENV=true ;;
    *)         echo "未知参数: $1" >&2; sed -n '2,5p' "$0"; exit 1 ;;
  esac
fi

# ════════════════════════════════════════
# 配置
# ════════════════════════════════════════
REMOTE_HOST="100.100.132.72"
REMOTE_USER="haohe"
REMOTE_DIR_DEFAULT="/home/haohe/data/.ai-english-tutor"
REMOTE_DIR="${REMOTE_DIR_DEFAULT}"
REMOTE_APP_DIR="${REMOTE_DIR}/app"
REMOTE_DATA_DIR="${REMOTE_DIR}/data"
REMOTE_BACKUP_DIR="${REMOTE_DIR}/backups"
REMOTE_ENV_FILE="${REMOTE_DATA_DIR}/.env"

LOCAL_PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_ENV_TEMP="${LOCAL_PROJECT_ROOT}/.env.deploy.generated"

# 加载公共配置生成库（颜色、prompt、env_get、generate_env）
source "${LOCAL_PROJECT_ROOT}/scripts/lib/setup-env.sh"

WHISPER_MODEL_FILE="${WHISPER_MODEL:-ggml-base.en.bin}"
WHISPER_MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${WHISPER_MODEL_FILE}"

RSYNC_EXCLUDES=(
  '.git'
  'node_modules'
  '.pnpm-store'
  '.codegraph'
  'dist'
  '.DS_Store'
  '*.log'
  'coverage'
  '.claude'
  '.context'
  'data'
  '.dev-data'
  'state_store.db'
  'stream_store'
  '.env'
  '.env.deploy.generated'
  '.env.deploy.existing'
  'docs/superpowers'
)

HEALTH_CHECK_RETRIES=3
HEALTH_CHECK_INTERVAL=10

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DATA_DIR="${REMOTE_BACKUP_DIR}/data-${TIMESTAMP}"
BACKUP_APP_DIR="${REMOTE_BACKUP_DIR}/app-${TIMESTAMP}"

TEST_DURATION=0
SYNC_COUNT=0

ENABLE_WHISPER=false
ENABLE_COSYVOICE=false

EXISTING_ENV_FILE=""

# ════════════════════════════════════════
# 工具函数
# ════════════════════════════════════════
remote_exec() {
  ssh "${REMOTE_USER}@${REMOTE_HOST}" "$*"
}

# TTY 版：用于需要实时进度的命令（如 docker build）。会注入控制字符，不用于解析输出。
remote_exec_tty() {
  ssh -t "${REMOTE_USER}@${REMOTE_HOST}" "$*"
}

# ════════════════════════════════════════
# 前置检查
# ════════════════════════════════════════
check_git_clean() {
  log_info "检查 git 工作区..."
  if ! git -C "${LOCAL_PROJECT_ROOT}" diff --quiet; then
    log_error "存在未提交的修改，请先提交或清理"
    exit 1
  fi
  if [ -n "$(git -C "${LOCAL_PROJECT_ROOT}" status --porcelain)" ]; then
    log_error "存在未跟踪的文件，请先处理"
    exit 1
  fi
  log_info "git 工作区干净"
}

check_ssh() {
  log_info "检查 SSH 连接 ${REMOTE_USER}@${REMOTE_HOST}..."
  if ! remote_exec "echo ok" >/dev/null 2>&1; then
    log_error "无法通过 SSH 连接到服务器（请确认密钥/网络）"
    exit 1
  fi
  log_info "SSH 连接正常"
}

ensure_remote_dirs() {
  log_info "确保服务器目录存在..."
  remote_exec "mkdir -p ${REMOTE_APP_DIR} ${REMOTE_DATA_DIR} ${REMOTE_BACKUP_DIR}"
}

# 交互式确认部署根目录，并按最终值重算派生路径
configure_remote_dir() {
  local input
  input=$(prompt "部署根目录（运行时数据/模型都放这里）" "${REMOTE_DIR_DEFAULT}")
  REMOTE_DIR="${input%/}"
  if [ -z "${REMOTE_DIR}" ]; then
    log_error "部署根目录不能为空"
    exit 1
  fi
  case "${REMOTE_DIR}" in
    /*) ;;
    *) log_error "部署根目录必须是绝对路径（以 / 开头）: ${REMOTE_DIR}"; exit 1 ;;
  esac
  REMOTE_APP_DIR="${REMOTE_DIR}/app"
  REMOTE_DATA_DIR="${REMOTE_DIR}/data"
  REMOTE_BACKUP_DIR="${REMOTE_DIR}/backups"
  REMOTE_ENV_FILE="${REMOTE_DATA_DIR}/.env"
  BACKUP_DATA_DIR="${REMOTE_BACKUP_DIR}/data-${TIMESTAMP}"
  BACKUP_APP_DIR="${REMOTE_BACKUP_DIR}/app-${TIMESTAMP}"
  log_info "部署根目录: ${REMOTE_DIR}"
  log_info "  代码:   ${REMOTE_APP_DIR}"
  log_info "  数据:   ${REMOTE_DATA_DIR}"
  log_info "  备份:   ${REMOTE_BACKUP_DIR}"
}

# 统一的远端 docker compose 调用：注入 AI_TUTOR_HOME、--env-file、叠加文件
dc() {
  remote_exec "cd ${REMOTE_APP_DIR} && AI_TUTOR_HOME=${REMOTE_DIR} docker compose --env-file ${REMOTE_ENV_FILE} $(compose_files) $*"
}

# TTY 版 dc：仅用于 up --build 等需要实时进度的命令
dc_tty() {
  remote_exec_tty "cd ${REMOTE_APP_DIR} && AI_TUTOR_HOME=${REMOTE_DIR} docker compose --env-file ${REMOTE_ENV_FILE} $(compose_files) $*"
}

# ════════════════════════════════════════
# 本地测试
# ════════════════════════════════════════
run_local_tests() {
  log_info "运行本地测试..."
  local start_time end_time
  start_time=$(date +%s)

  log_info "后端测试 (@ai-english-tutor/server)..."
  if ! (cd "${LOCAL_PROJECT_ROOT}" && pnpm --filter @ai-english-tutor/server test); then
    log_error "后端测试失败"
    exit 1
  fi

  log_info "前端测试 (tutor-app)..."
  if ! (cd "${LOCAL_PROJECT_ROOT}" && pnpm --filter tutor-app test); then
    log_error "前端测试失败"
    exit 1
  fi

  end_time=$(date +%s)
  TEST_DURATION=$((end_time - start_time))
  log_info "本地测试通过，耗时 ${TEST_DURATION}s"
}

# ════════════════════════════════════════
# 交互式 .env
# ════════════════════════════════════════
# 公共逻辑已迁移到 scripts/lib/setup-env.sh 的 generate_env()。
# 本文件只保留远端特有的 env 文件拉取/上传/判断逻辑。

configure_remote_env() {
  # --use-local-env：跳过交互式配置，直接上传本地 ~/.ai-english-tutor/data/.env
  if $USE_LOCAL_ENV; then
    local local_env="${AI_TUTOR_HOME:-$HOME/.ai-english-tutor}/data/.env"
    if [ ! -f "${local_env}" ]; then
      log_error "本地 ${local_env} 不存在，无法使用 --use-local-env"
      exit 1
    fi
    log_info "使用本地 .env: ${local_env}"
    scp "${local_env}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ENV_FILE}"
    detect_compose_overlays
    return 0
  fi

  if remote_exec "[ -f ${REMOTE_ENV_FILE} ]"; then
    log_info "服务器已存在 ${REMOTE_ENV_FILE}"
    # 拉取远端 .env 到本地，作为本次交互式配置的默认值来源
    EXISTING_ENV_FILE="${LOCAL_PROJECT_ROOT}/.env.deploy.existing"
    if ! scp "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ENV_FILE}" "${EXISTING_ENV_FILE}" >/dev/null 2>&1; then
      log_warn "拉取远端 .env 失败，将以内置默认值进行交互"
      EXISTING_ENV_FILE=""
    fi
    local reconfigure=false
    if remote_exec "grep -qE 'your-.*-api-key|^XIAOMI_API_KEY=$|^XIAOMI_TTS_API_KEY=$|^VOLCENGINE_TTS_API_KEY=$' ${REMOTE_ENV_FILE}"; then
      log_warn "检测到 .env 中存在占位符或空 API Key"
      if prompt_yes_no "是否重新交互式配置（默认值=现有配置，API Key 回车保留）"; then
        reconfigure=true
      fi
    else
      if prompt_yes_no "是否重新交互式配置 .env（默认值=现有配置，回车逐项保留；N=原样沿用）"; then
        reconfigure=true
      fi
    fi
    if $reconfigure; then
      generate_env "${LOCAL_ENV_TEMP}" "${EXISTING_ENV_FILE:-}" false
      ENABLE_WHISPER="${GENERATED_ENABLE_WHISPER:-false}"
      ENABLE_COSYVOICE="${GENERATED_ENABLE_COSYVOICE:-false}"
      scp "${LOCAL_ENV_TEMP}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ENV_FILE}"
    fi
    [ -n "${EXISTING_ENV_FILE}" ] && rm -f "${EXISTING_ENV_FILE}"
    EXISTING_ENV_FILE=""
  else
    log_warn "服务器不存在 ${REMOTE_ENV_FILE}"
    if prompt_yes_no "是否交互式创建 .env"; then
      generate_env "${LOCAL_ENV_TEMP}" "" false
      ENABLE_WHISPER="${GENERATED_ENABLE_WHISPER:-false}"
      ENABLE_COSYVOICE="${GENERATED_ENABLE_COSYVOICE:-false}"
      scp "${LOCAL_ENV_TEMP}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ENV_FILE}"
    else
      log_warn "跳过 .env 配置，将由 init-host-dir.sh 从模板复制（含占位符，需手动编辑）"
    fi
  fi
  rm -f "${LOCAL_ENV_TEMP}"
}

# ════════════════════════════════════════
# 备份 / 同步 / 初始化 data/
# ════════════════════════════════════════
backup_remote() {
  log_info "备份服务器数据..."
  remote_exec "mkdir -p ${BACKUP_DATA_DIR} ${BACKUP_APP_DIR}"
  # 排除 whisper/cosyvoice 模型目录（可重新下载）
  remote_exec "if [ -d ${REMOTE_DATA_DIR} ]; then find ${REMOTE_DATA_DIR} -mindepth 1 -maxdepth 1 ! -name whisper-models ! -name cosyvoice-models -exec cp -a {} ${BACKUP_DATA_DIR}/ \\; 2>/dev/null || true; fi"
  remote_exec "if [ -d ${REMOTE_APP_DIR} ]; then cp -a ${REMOTE_APP_DIR}/. ${BACKUP_APP_DIR}/ 2>/dev/null || true; fi"
  log_info "数据备份: ${BACKUP_DATA_DIR}"
  log_info "代码备份: ${BACKUP_APP_DIR}"
}

sync_code() {
  log_info "同步代码到服务器..."
  local exclude_args=()
  for item in "${RSYNC_EXCLUDES[@]}"; do
    exclude_args+=("--exclude=${item}")
  done

  local rsync_log
  rsync_log=$(mktemp)
  rsync -avz --delete --itemize-changes \
    ${exclude_args[@]+"${exclude_args[@]}"} \
    "${LOCAL_PROJECT_ROOT}/" \
    "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_APP_DIR}/" | tee "${rsync_log}"

  SYNC_COUNT=$(grep -cE '^[<>][fcdLDS]' "${rsync_log}" 2>/dev/null || true)
  SYNC_COUNT=${SYNC_COUNT:-0}
  rm -f "${rsync_log}"
  log_info "rsync 完成，共变更 ${SYNC_COUNT} 个文件/目录"
}

init_remote_data_dir() {
  log_info "在服务器初始化 data/ 目录..."
  remote_exec "bash ${REMOTE_APP_DIR}/scripts/init-host-dir.sh ${REMOTE_DIR}"
}

# 上传本地 mkcert 自签证书到远端。rsync 排除 data/，所以证书必须显式 scp。
sync_certs() {
  local local_cert="${LOCAL_PROJECT_ROOT}/data/certs/fullchain.pem"
  local local_key="${LOCAL_PROJECT_ROOT}/data/certs/privkey.pem"
  if [ ! -f "$local_cert" ] || [ ! -f "$local_key" ]; then
    log_warn "本地未发现 ${local_cert} / ${local_key}，跳过 HTTPS 部署"
    log_warn "  如需 HTTPS：先在本机跑 'bash scripts/init-host-dir.sh' 生成 mkcert 证书，再重跑部署"
    return 0
  fi
  log_info "上传 mkcert 证书到 ${REMOTE_DATA_DIR}/certs/ ..."
  remote_exec "mkdir -p ${REMOTE_DATA_DIR}/certs"
  scp "$local_cert" "$local_key" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DATA_DIR}/certs/"
  log_info "证书已上传，gateway 将自动启用 HTTPS (443)"
}

# ════════════════════════════════════════
# Compose 叠加文件探测
# ════════════════════════════════════════
# 依据远端 .env 的 ASR_PROVIDER / TTS_PROVIDER 推断需要哪些叠加 compose 文件。
detect_compose_overlays() {
  if ! remote_exec "[ -f ${REMOTE_ENV_FILE} ]"; then
    log_warn "远端无 .env，按仅主 compose 部署"
    return 0
  fi
  local asr tts
  asr=$(remote_exec "grep -E '^ASR_PROVIDER=' ${REMOTE_ENV_FILE} | tail -1 | cut -d= -f2 | tr -d '[:space:]'" || true)
  tts=$(remote_exec "grep -E '^TTS_PROVIDER=' ${REMOTE_ENV_FILE} | tail -1 | cut -d= -f2 | tr -d '[:space:]'" || true)
  [ "${asr}" = "whisper" ] && ENABLE_WHISPER=true
  [ "${tts}" = "cosyvoice" ] && ENABLE_COSYVOICE=true
  log_info "compose 叠加：ASR=${asr:-?}(whisper=${ENABLE_WHISPER}) / TTS=${tts:-?}(cosyvoice=${ENABLE_COSYVOICE})"
}

# 组装 docker compose 的 -f 参数（主 compose + 按需叠加）
compose_files() {
  local files="-f docker-compose.yml"
  $ENABLE_WHISPER   && files="${files} -f docker-compose.whisper.yml"
  $ENABLE_COSYVOICE && files="${files} -f docker-compose.cosyvoice.yml"
  echo "${files}"
}

# ════════════════════════════════════════
# Whisper 模型引导
# ════════════════════════════════════════
ensure_whisper_model() {
  if ! $ENABLE_WHISPER; then
    log_info "ASR 非 whisper，跳过 whisper 模型引导"
    return 0
  fi
  local model_dir="${REMOTE_DATA_DIR}/whisper-models"
  local model_path="${model_dir}/${WHISPER_MODEL_FILE}"
  log_info "检查 whisper 模型 (${model_path})..."
  remote_exec "mkdir -p ${model_dir}"
  if remote_exec "[ -f ${model_path} ]" >/dev/null 2>&1; then
    log_info "whisper 模型已存在，跳过下载"
    return 0
  fi
  log_warn "whisper 模型缺失，开始下载（~150MB，首次较慢）..."
  if ! remote_exec "docker run --rm -v ${model_dir}:/models alpine sh -c 'apk add --no-cache curl >/dev/null && curl -fL --retry 3 -o /models/${WHISPER_MODEL_FILE} ${WHISPER_MODEL_URL}'"; then
    log_error "whisper 模型下载失败"
    cat >&2 <<HINT

${YELLOW}[手动重试]${NC} 国内访问 HuggingFace 可能不稳定。可选方案（模型目录: ${model_dir}）：

  ${GREEN}# 方案 1：直接重试 HuggingFace（多用 --retry，可能需要科学上网）${NC}
  ssh ${REMOTE_USER}@${REMOTE_HOST} \\
    "docker run --rm -v ${model_dir}:/models alpine sh -c \\
      'apk add --no-cache curl >/dev/null && \\
       curl -fL --retry 5 -o /models/${WHISPER_MODEL_FILE} \\
         ${WHISPER_MODEL_URL}'"

  ${GREEN}# 方案 2：换 hf-mirror.com（国内镜像，无需科学上网）${NC}
  ssh ${REMOTE_USER}@${REMOTE_HOST} \\
    "docker run --rm -v ${model_dir}:/models alpine sh -c \\
      'apk add --no-cache curl >/dev/null && \\
       curl -fL --retry 5 -o /models/${WHISPER_MODEL_FILE} \\
         https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/${WHISPER_MODEL_FILE}'"

  ${GREEN}# 方案 3：本地下载后 scp 上传（最可靠）${NC}
  curl -fL -O ${WHISPER_MODEL_URL}
  scp ${WHISPER_MODEL_FILE} ${REMOTE_USER}@${REMOTE_HOST}:${model_dir}/

模型就绪后重新运行 ${GREEN}./scripts/deploy-to-server.sh${NC} 即可。
HINT
    exit 1
  fi
  log_info "whisper 模型下载完成"
}

# ════════════════════════════════════════
# Docker 启动 / 健康检查 / 回滚
# ════════════════════════════════════════
deploy_services() {
  log_info "在服务器上构建并启动服务..."
  log_info "compose 文件: $(compose_files)"
  dc down
  # 用 TTY 版执行 up --build，让 BuildKit 进度实时可见
  dc_tty "up --build -d"
  log_info "服务已启动（后台），等待健康检查"
}

check_health() {
  local attempt=1
  local healthy_count
  while [ ${attempt} -le ${HEALTH_CHECK_RETRIES} ]; do
    log_info "健康检查 ${attempt}/${HEALTH_CHECK_RETRIES}..."
    healthy_count=$(dc "ps --format json backend gateway 2>/dev/null | grep -c '\"Health\":\"healthy\"' || true")
    healthy_count=${healthy_count:-0}
    if [ "${healthy_count}" -ge 2 ]; then
      log_info "backend 和 gateway 均健康"
      return 0
    fi
    log_warn "当前健康容器: ${healthy_count}/2"
    if [ ${attempt} -lt ${HEALTH_CHECK_RETRIES} ]; then
      sleep ${HEALTH_CHECK_INTERVAL}
    fi
    attempt=$((attempt + 1))
  done
  return 1
}

rollback() {
  log_error "健康检查连续 ${HEALTH_CHECK_RETRIES} 次失败，开始回滚到 ${BACKUP_APP_DIR}..."
  dc down
  remote_exec "find ${REMOTE_APP_DIR} -mindepth 1 -delete && cp -a ${BACKUP_APP_DIR}/. ${REMOTE_APP_DIR}/"
  dc "up -d"

  if check_health; then
    log_info "回滚成功，服务已恢复到上一个版本"
  else
    log_error "回滚后服务仍不健康，请手动 ssh 检查 docker compose logs"
    exit 1
  fi
}

# ════════════════════════════════════════
# 报告 / Main
# ════════════════════════════════════════
print_report() {
  local status="$1"
  local test_duration="$2"
  local sync_count="$3"
  local deploy_duration="$4"

  echo ""
  echo "================ 部署报告 ================"
  echo "本地测试：          通过 (${test_duration}s)"
  echo "服务器：            ${REMOTE_USER}@${REMOTE_HOST}"
  echo "数据备份：          ${BACKUP_DATA_DIR}"
  echo "代码备份：          ${BACKUP_APP_DIR}"
  echo "代码变更文件数：    ${sync_count}"
  echo "部署耗时：          ${deploy_duration}s"
  echo "容器状态："
  dc "ps --format 'table {{.Name}}\t{{.Status}}'" || true
  echo "结果：              ${status}"
  echo "=========================================="
}

main() {
  local start_time deploy_duration

  check_git_clean
  check_ssh
  configure_remote_dir
  ensure_remote_dirs

  run_local_tests

  configure_remote_env
  backup_remote

  start_time=$(date +%s)
  sync_code
  init_remote_data_dir
  sync_certs
  detect_compose_overlays
  ensure_whisper_model
  deploy_services

  if check_health; then
    deploy_duration=$(($(date +%s) - start_time))
    print_report "成功" "${TEST_DURATION}" "${SYNC_COUNT}" "${deploy_duration}"
    exit 0
  else
    rollback
    deploy_duration=$(($(date +%s) - start_time))
    print_report "失败并已回滚" "${TEST_DURATION}" "${SYNC_COUNT}" "${deploy_duration}"
    exit 1
  fi
}

main "$@"
