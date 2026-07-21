# AI English Tutor —— 部署脚本公共库
# 被 scripts/deploy-to-server.sh 和 scripts/deploy.sh source 使用。
#
# 本文件不直接执行，只提供部署流程函数。调用方需要先设置以下变量：
#   REMOTE_HOST, REMOTE_USER, REMOTE_DIR
#   REMOTE_APP_DIR, REMOTE_DATA_DIR, REMOTE_BACKUP_DIR, REMOTE_ENV_FILE
#   LOCAL_PROJECT_ROOT, LOCAL_ENV_TEMP
#   USE_LOCAL_ENV, SKIP_TESTS

# 加载配置生成库
source "${LOCAL_PROJECT_ROOT}/scripts/lib/setup-env.sh"
source "${LOCAL_PROJECT_ROOT}/scripts/validate-env.sh"

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
  '.env.last-known-good'
  'docs/superpowers'
)

HEALTH_CHECK_RETRIES=3
HEALTH_CHECK_INTERVAL=10
BACKUP_KEEP=${BACKUP_KEEP:-5}

TEST_DURATION=0
SYNC_COUNT=0

ENABLE_WHISPER=false
ENABLE_COSYVOICE=false
# 由 deploy-to-server.sh 通过 --non-interactive-env 传入；自动化部署时基于远端现有 .env 非交互升级格式
NONINTERACTIVE_ENV="${NONINTERACTIVE_ENV:-false}"

EXISTING_ENV_FILE=""

# ── 工具函数 ──
remote_exec() {
  ssh "${REMOTE_USER}@${REMOTE_HOST}" "$*"
}

remote_exec_tty() {
  ssh -t "${REMOTE_USER}@${REMOTE_HOST}" "$*"
}

# ── 前置检查 ──
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

# ── 本地测试 ──
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

# ── 远端 .env 配置 ──
configure_remote_env() {
  if $USE_LOCAL_ENV; then
    local local_env="${AI_TUTOR_HOME:-$HOME/.ai-english-tutor}/data/.env"
    if [ ! -f "${local_env}" ]; then
      log_error "本地 ${local_env} 不存在，无法使用 --use-local-env"
      exit 1
    fi
    log_info "使用本地 .env: ${local_env}"
    scp "${local_env}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ENV_FILE}"
    return 0
  fi

  if remote_exec "[ -f ${REMOTE_ENV_FILE} ]"; then
    log_info "服务器已存在 ${REMOTE_ENV_FILE}"
    EXISTING_ENV_FILE="${LOCAL_PROJECT_ROOT}/.env.deploy.existing"
    if ! scp "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ENV_FILE}" "${EXISTING_ENV_FILE}" >/dev/null 2>&1; then
      log_warn "拉取远端 .env 失败，将以内置默认值进行交互"
      EXISTING_ENV_FILE=""
    fi
    if $NONINTERACTIVE_ENV; then
      log_info "非交互模式：基于远端现有 .env 重新生成为新格式（保留生产值，补齐新字段）"
      generate_env "${LOCAL_ENV_TEMP}" "${EXISTING_ENV_FILE:-}" true
      validate_env "${LOCAL_ENV_TEMP}" || true
      scp "${LOCAL_ENV_TEMP}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ENV_FILE}"
      [ -n "${EXISTING_ENV_FILE}" ] && rm -f "${EXISTING_ENV_FILE}"
      EXISTING_ENV_FILE=""
      rm -f "${LOCAL_ENV_TEMP}"
      return 0
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
      validate_env "${LOCAL_ENV_TEMP}" || true
      scp "${LOCAL_ENV_TEMP}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ENV_FILE}"
    fi
    [ -n "${EXISTING_ENV_FILE}" ] && rm -f "${EXISTING_ENV_FILE}"
    EXISTING_ENV_FILE=""
  else
    log_warn "服务器不存在 ${REMOTE_ENV_FILE}"
    if $NONINTERACTIVE_ENV; then
      log_info "非交互模式：从模板生成默认 .env（占位符需后续手动编辑 API Key）"
      generate_env "${LOCAL_ENV_TEMP}" "" true
      validate_env "${LOCAL_ENV_TEMP}" || true
      scp "${LOCAL_ENV_TEMP}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ENV_FILE}"
      rm -f "${LOCAL_ENV_TEMP}"
      return 0
    fi
    if prompt_yes_no "是否交互式创建 .env"; then
      generate_env "${LOCAL_ENV_TEMP}" "" false
      validate_env "${LOCAL_ENV_TEMP}" || true
      scp "${LOCAL_ENV_TEMP}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ENV_FILE}"
    else
      log_warn "跳过 .env 配置，将由 init-host-dir.sh 从模板复制（含占位符，需手动编辑）"
    fi
  fi
  rm -f "${LOCAL_ENV_TEMP}"
}

# ── 备份 / 同步 / 初始化 ──
backup_remote() {
  log_info "备份服务器数据..."
  remote_exec "mkdir -p ${BACKUP_DATA_DIR} ${BACKUP_APP_DIR}"
  remote_exec "if [ -d ${REMOTE_DATA_DIR} ]; then find ${REMOTE_DATA_DIR} -mindepth 1 -maxdepth 1 ! -name whisper-models ! -name cosyvoice-models -exec cp -a {} ${BACKUP_DATA_DIR}/ \; 2>/dev/null || true; fi"
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

# ── Compose 叠加文件探测 ──
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

compose_files() {
  local files="-f docker-compose.yml"
  $ENABLE_WHISPER   && files="${files} -f docker-compose.whisper.yml"
  $ENABLE_COSYVOICE && files="${files} -f docker-compose.cosyvoice.yml"
  echo "${files}"
}

# 统一的远端 docker compose 调用
dc() {
  remote_exec "cd ${REMOTE_APP_DIR} && AI_TUTOR_HOME=${REMOTE_DIR} docker compose --env-file ${REMOTE_ENV_FILE} $(compose_files) $*"
}

dc_tty() {
  remote_exec_tty "cd ${REMOTE_APP_DIR} && AI_TUTOR_HOME=${REMOTE_DIR} docker compose --env-file ${REMOTE_ENV_FILE} $(compose_files) $*"
}

# ── Whisper 模型引导 ──
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
  ssh ${REMOTE_USER}@${REMOTE_HOST} \
    "docker run --rm -v ${model_dir}:/models alpine sh -c \
      'apk add --no-cache curl >/dev/null && \
       curl -fL --retry 5 -o /models/${WHISPER_MODEL_FILE} \
         ${WHISPER_MODEL_URL}'"

  ${GREEN}# 方案 2：换 hf-mirror.com（国内镜像，无需科学上网）${NC}
  ssh ${REMOTE_USER}@${REMOTE_HOST} \
    "docker run --rm -v ${model_dir}:/models alpine sh -c \
      'apk add --no-cache curl >/dev/null && \
       curl -fL --retry 5 -o /models/${WHISPER_MODEL_FILE} \
         https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/${WHISPER_MODEL_FILE}'"

  ${GREEN}# 方案 3：本地下载后 scp 上传（最可靠）${NC}
  curl -fL -O ${WHISPER_MODEL_URL}
  scp ${WHISPER_MODEL_FILE} ${REMOTE_USER}@${REMOTE_HOST}:${model_dir}/

模型就绪后重新运行部署脚本即可。
HINT
    exit 1
  fi
  log_info "whisper 模型下载完成"
}

# ── Docker 启动 / 健康检查 / 回滚 ──
deploy_services() {
  log_info "在服务器上构建并启动服务..."
  log_info "compose 文件: $(compose_files)"
  dc down
  if ! dc_tty "up --build -d"; then
    log_error "docker compose up --build 失败（build 或启动失败）"
    return 1
  fi
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

wait_cosyvoice_healthy() {
  if ! $ENABLE_COSYVOICE; then
    return 0
  fi
  log_info "等待 cosyvoice 容器健康（模型加载约 90-120s）..."

  local cv_container
  cv_container=$(dc "ps -q cosyvoice 2>/dev/null || true" | head -1 | tr -d '[:space:]')
  if [ -z "${cv_container}" ]; then
    log_warn "未找到 cosyvoice 容器，跳过健康等待（请检查 docker compose ps）"
    return 0
  fi

  local timeout=180
  local interval=10
  local elapsed=0
  local status=""
  while [ ${elapsed} -lt ${timeout} ]; do
    status=$(remote_exec "docker inspect --format '{{.State.Health.Status}}' ${cv_container} 2>/dev/null" || true)
    case "${status}" in
      ""|"<no value>") status="unknown" ;;
    esac
    if [ "${status}" = "healthy" ]; then
      log_info "cosyvoice 已健康（耗时 ${elapsed}s）"
      return 0
    fi
    log_warn "cosyvoice 状态: ${status}，已等待 ${elapsed}s"
    sleep ${interval}
    elapsed=$((elapsed + interval))
  done

  log_warn "cosyvoice 未在 ${timeout}s 内健康（最后状态: ${status}），不阻塞部署；请稍后手动检查"
  return 0
}

get_cosyvoice_health() {
  if ! $ENABLE_COSYVOICE; then
    echo "未启用"
    return 0
  fi
  local cv_container status
  cv_container=$(dc "ps -q cosyvoice 2>/dev/null || true" | head -1 | tr -d '[:space:]')
  if [ -z "${cv_container}" ]; then
    echo "未找到容器"
    return 0
  fi
  status=$(remote_exec "docker inspect --format '{{.State.Health.Status}}' ${cv_container} 2>/dev/null" || true)
  case "${status}" in
    ""|"<no value>") echo "unknown" ;;
    *) echo "${status}" ;;
  esac
}

cleanup_old_backups() {
  local keep=${BACKUP_KEEP}
  log_info "清理旧备份（保留最近 ${keep} 份）..."
  remote_exec "cd ${REMOTE_BACKUP_DIR} && ls -1d data-* 2>/dev/null | sort -r | tail -n +$((keep+1)) | xargs -r rm -rf"
  remote_exec "cd ${REMOTE_BACKUP_DIR} && ls -1d app-* 2>/dev/null | sort -r | tail -n +$((keep+1)) | xargs -r rm -rf"
}

rollback() {
  log_error "健康检查连续 ${HEALTH_CHECK_RETRIES} 次失败，开始回滚到 ${BACKUP_APP_DIR}..."
  dc down
  remote_exec "find ${REMOTE_APP_DIR} -mindepth 1 -delete && cp -a ${BACKUP_APP_DIR}/. ${REMOTE_APP_DIR}/"

  if [ "${RESTORE_DATA_ON_ROLLBACK:-false}" = "true" ]; then
    log_warn "RESTORE_DATA_ON_ROLLBACK=true，恢复部署前数据备份 ${BACKUP_DATA_DIR}..."
    remote_exec "rm -rf ${REMOTE_DATA_DIR} && cp -a ${BACKUP_DATA_DIR} ${REMOTE_DATA_DIR}"
  else
    log_warn "未恢复 data/（避免丢失新数据）；如需恢复，数据备份在 ${BACKUP_DATA_DIR}"
    log_warn "  手动恢复: ssh ${REMOTE_USER}@${REMOTE_HOST} 'rm -rf ${REMOTE_DATA_DIR} && cp -a ${BACKUP_DATA_DIR} ${REMOTE_DATA_DIR}'"
  fi

  dc "up -d"

  if check_health; then
    log_info "回滚成功，服务已恢复到上一个版本"
  else
    log_error "回滚后服务仍不健康，请手动 ssh 检查 docker compose logs"
    exit 1
  fi
}

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
  echo "CosyVoice：         $(get_cosyvoice_health)"
  echo "结果：              ${status}"
  echo "=========================================="
}

# 主流程
deploy_main() {
  local start_time deploy_duration

  check_git_clean
  check_ssh
  ensure_remote_dirs

  if $SKIP_TESTS; then
    log_warn "已指定 --skip-tests，跳过本地测试"
    TEST_DURATION=0
  else
    run_local_tests
  fi

  configure_remote_env
  backup_remote

  start_time=$(date +%s)
  sync_code
  init_remote_data_dir
  sync_certs
  detect_compose_overlays
  ensure_whisper_model

  if ! deploy_services; then
    rollback
    deploy_duration=$(($(date +%s) - start_time))
    print_report "失败并已回滚" "${TEST_DURATION}" "${SYNC_COUNT}" "${deploy_duration}"
    exit 1
  fi

  if check_health; then
    wait_cosyvoice_healthy
    cleanup_old_backups
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
