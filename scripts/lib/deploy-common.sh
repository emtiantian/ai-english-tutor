# AI English Tutor —— 部署脚本公共库
# 被 scripts/deploy-to-server.sh 和 scripts/deploy.sh source 使用。
#
# 本文件不直接执行，只提供部署流程函数。调用方需要先设置以下变量：
#   REMOTE_HOST, REMOTE_USER, REMOTE_DIR
#   REMOTE_APP_DIR, REMOTE_DATA_DIR, REMOTE_BACKUP_DIR, REMOTE_ENV_FILE
#   LOCAL_PROJECT_ROOT, LOCAL_ENV_TEMP
#   USE_LOCAL_ENV, SKIP_TESTS, DRY_RUN

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
# build 阶段超时（秒）：build 卡死时超时退出，旧服务仍在运行不宕机（历史 buildkit 缓存损坏曾卡死 36 分钟）
BUILD_TIMEOUT=${BUILD_TIMEOUT:-600}

TEST_DURATION=0
SYNC_COUNT=0

ENABLE_WHISPER=false
ENABLE_COSYVOICE=false
# cosyvoice:local 镜像缺失时置 true：主部署跳过 cosyvoice 服务，由 pnpm deploy:cosyvoice 单独构建
COSYVOICE_IMAGE_MISSING=false
# 由 deploy-to-server.sh 通过 --non-interactive-env 传入；自动化部署时基于远端现有 .env 非交互升级格式
NONINTERACTIVE_ENV="${NONINTERACTIVE_ENV:-false}"
# 远程部署只以远端已有配置和模板为输入，避免本机 shell 的密钥覆盖生产值。
GENERATE_USE_PROCESS_ENV=false

EXISTING_ENV_FILE=""

# 检测到新 migration 文件时设为 true，rollback 默认恢复 data 备份
DB_SCHEMA_WILL_CHANGE=false

# dry-run 模式下远端写操作只打印不执行
DRY_RUN=${DRY_RUN:-false}

# ── 颜色输出（自动检测 TTY）──
if [ -t 2 ]; then
  RED=$'\033[0;31m'
  GREEN=$'\033[0;32m'
  YELLOW=$'\033[1;33m'
  BLUE=$'\033[0;34m'
  NC=$'\033[0m'
else
  RED=''
  GREEN=''
  YELLOW=''
  BLUE=''
  NC=''
fi

log_info()  { echo "${GREEN}[INFO]${NC} $*"; }
log_warn()  { echo "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo "${RED}[ERROR]${NC} $*" >&2; }
log_dry()   { echo "${BLUE}[DRY-RUN]${NC} $*"; }

# ── 工具函数 ──
remote_exec() {
  if $DRY_RUN; then
    log_dry "ssh ${REMOTE_USER}@${REMOTE_HOST} $*"
    return 0
  fi
  ssh "${REMOTE_USER}@${REMOTE_HOST}" "$*"
}

remote_exec_tty() {
  if $DRY_RUN; then
    log_dry "ssh -t ${REMOTE_USER}@${REMOTE_HOST} $*"
    return 0
  fi
  ssh -t "${REMOTE_USER}@${REMOTE_HOST}" "$*"
}

# 在 dry-run 模式下仍真实执行（用于只读探测）
remote_exec_real() {
  ssh "${REMOTE_USER}@${REMOTE_HOST}" "$*"
}

# 统一的远端 docker compose 调用
dc() {
  remote_exec "cd ${REMOTE_APP_DIR} && AI_TUTOR_HOME=${REMOTE_DIR} docker compose --env-file ${REMOTE_ENV_FILE} $(compose_files) $*"
}

dc_tty() {
  # DC_TTY_TIMEOUT 非空时，用 timeout 包裹 docker compose（用于 build 防卡死）
  local timeout_prefix=""
  [ -n "${DC_TTY_TIMEOUT:-}" ] && timeout_prefix="timeout ${DC_TTY_TIMEOUT} "
  remote_exec_tty "cd ${REMOTE_APP_DIR} && AI_TUTOR_HOME=${REMOTE_DIR} ${timeout_prefix}docker compose --env-file ${REMOTE_ENV_FILE} $(compose_files) $*"
}

# ── 前置检查 ──
check_git_clean() {
  log_info "检查 git 工作区..."
  if ! git -C "${LOCAL_PROJECT_ROOT}" diff --quiet; then
    if $DRY_RUN; then
      log_warn "dry-run：git 工作区存在未提交修改"
      return 0
    fi
    log_error "存在未提交的修改，请先提交或清理"
    exit 1
  fi
  if [ -n "$(git -C "${LOCAL_PROJECT_ROOT}" status --porcelain)" ]; then
    if $DRY_RUN; then
      log_warn "dry-run：git 工作区存在未跟踪文件"
      return 0
    fi
    log_error "存在未跟踪的文件，请先处理"
    exit 1
  fi
  log_info "git 工作区干净"
}

check_ssh() {
  log_info "检查 SSH 连接 ${REMOTE_USER}@${REMOTE_HOST}..."
  if ! remote_exec_real "echo ok" >/dev/null 2>&1; then
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
  if $DRY_RUN; then
    log_dry "跳过本地测试（dry-run 模式）"
    TEST_DURATION=0
    return 0
  fi

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

    if $DRY_RUN; then
      log_dry "将 scp ${local_env} -> ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ENV_FILE}"
      # dry-run 也做占位符检查，避免部署半成品
      if ! validate_env --strict "${local_env}"; then
        log_error "本地 .env 校验失败，请补全配置"
        exit 1
      fi
      if check_env_has_placeholder "${local_env}"; then
        log_error "本地 .env 存在占位符或空 API Key，请补全后再部署"
        exit 1
      fi
      return 0
    fi

    if ! validate_env --strict "${local_env}"; then
      log_error "本地 .env 校验失败，请补全配置"
      exit 1
    fi
    if check_env_has_placeholder "${local_env}"; then
      log_error "本地 .env 存在占位符或空 API Key，请补全后再部署"
      exit 1
    fi
    scp "${local_env}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ENV_FILE}"
    return 0
  fi

  if remote_exec_real "[ -f ${REMOTE_ENV_FILE} ]"; then
    log_info "服务器已存在 ${REMOTE_ENV_FILE}"
    EXISTING_ENV_FILE="${LOCAL_PROJECT_ROOT}/.env.deploy.existing"
    if ! scp "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ENV_FILE}" "${EXISTING_ENV_FILE}" >/dev/null 2>&1; then
      log_warn "拉取远端 .env 失败，将以内置默认值进行交互"
      EXISTING_ENV_FILE=""
    fi
    if $NONINTERACTIVE_ENV; then
      log_info "非交互模式：基于远端现有 .env 重新生成为新格式（保留生产值，补齐新字段）"
      generate_env "${LOCAL_ENV_TEMP}" "${EXISTING_ENV_FILE:-}" true
      if ! validate_env --strict "${LOCAL_ENV_TEMP}"; then
        log_error "生成后的 .env 校验失败，请检查远端配置或改用交互模式"
        exit 1
      fi
      if check_env_has_placeholder "${LOCAL_ENV_TEMP}"; then
        log_error "生成后的 .env 存在占位符或空 API Key，请改用交互模式补全"
        exit 1
      fi
      if $DRY_RUN; then
        log_dry "将 scp ${LOCAL_ENV_TEMP} -> ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ENV_FILE}"
      else
        scp "${LOCAL_ENV_TEMP}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ENV_FILE}"
      fi
      [ -n "${EXISTING_ENV_FILE}" ] && rm -f "${EXISTING_ENV_FILE}"
      EXISTING_ENV_FILE=""
      return 0
    fi
    local reconfigure=false
    if remote_exec_real "grep -qE 'your-.*-api-key|^XIAOMI_API_KEY=$|^XIAOMI_TTS_API_KEY=$|^VOLCENGINE_TTS_API_KEY=$' ${REMOTE_ENV_FILE}"; then
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
      if ! validate_env --strict "${LOCAL_ENV_TEMP}" || check_env_has_placeholder "${LOCAL_ENV_TEMP}"; then
        log_error "生成后的 .env 校验失败，未覆盖服务器配置"
        exit 1
      fi
      if $DRY_RUN; then
        log_dry "将 scp ${LOCAL_ENV_TEMP} -> ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ENV_FILE}"
      else
        scp "${LOCAL_ENV_TEMP}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ENV_FILE}"
      fi
    elif ! validate_env --strict "${EXISTING_ENV_FILE}" || check_env_has_placeholder "${EXISTING_ENV_FILE}"; then
      log_error "服务器现有 .env 校验失败，请重新运行并选择交互式配置"
      exit 1
    fi
    [ -n "${EXISTING_ENV_FILE}" ] && rm -f "${EXISTING_ENV_FILE}"
    EXISTING_ENV_FILE=""
  else
    log_warn "服务器不存在 ${REMOTE_ENV_FILE}"
    if $DRY_RUN; then
      log_info "dry-run：从模板生成 .env 预览"
      generate_env "${LOCAL_ENV_TEMP}" "" true
      return 0
    fi
    if $NONINTERACTIVE_ENV; then
      log_info "非交互模式：从模板生成默认 .env"
      generate_env "${LOCAL_ENV_TEMP}" "" true
      if ! validate_env --strict "${LOCAL_ENV_TEMP}"; then
        log_error "生成后的 .env 校验失败，请检查模板或改用交互模式"
        exit 1
      fi
      if check_env_has_placeholder "${LOCAL_ENV_TEMP}"; then
        log_error "生成后的 .env 存在占位符或空 API Key，请改用交互模式补全"
        exit 1
      fi
      if $DRY_RUN; then
        log_dry "将 scp ${LOCAL_ENV_TEMP} -> ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ENV_FILE}"
      else
        scp "${LOCAL_ENV_TEMP}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ENV_FILE}"
      fi
      return 0
    fi
    if prompt_yes_no "是否交互式创建 .env"; then
      generate_env "${LOCAL_ENV_TEMP}" "" false
      if ! validate_env --strict "${LOCAL_ENV_TEMP}" || check_env_has_placeholder "${LOCAL_ENV_TEMP}"; then
        log_error "生成后的 .env 校验失败，未上传到服务器"
        exit 1
      fi
      if $DRY_RUN; then
        log_dry "将 scp ${LOCAL_ENV_TEMP} -> ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ENV_FILE}"
      else
        scp "${LOCAL_ENV_TEMP}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ENV_FILE}"
      fi
    else
      log_warn "跳过 .env 配置，将由 init-host-dir.sh 从模板复制（含占位符，需手动编辑）"
    fi
  fi
  # LOCAL_ENV_TEMP 在 dry-run 模式下保留，供后续 overlay 探测使用；
  # 非 dry-run 模式下由 deploy_main 末尾统一清理。
}

# 检查 .env 中是否存在明显占位符（未填写的模板默认值）
# 返回 0 表示存在占位符（即有问题）
# 注意：API Key 的空值校验由 validate_env --strict 按 provider 按需负责（见 validate-env.sh），
#       此处只检测 your-xxx-api-key 这类字面占位符，避免对未启用 provider 的 key 误报阻塞部署
#       （如 LLM_PROVIDER=volcengine 时 OPENAI_API_KEY 为空属正常）。
check_env_has_placeholder() {
  local env_file="$1"
  if [ ! -f "${env_file}" ]; then
    return 1
  fi
  # 匹配 your-xxx-api-key 模板默认值（用户直接复制模板未填写）
  if grep -qE 'your-.*-api-key' "${env_file}"; then
    log_warn "检测到占位符: your-.*-api-key"
    return 0
  fi
  return 1
}

# ── 备份 / 同步 / 初始化 ──
backup_remote() {
  log_info "备份服务器数据..."
  local backend_was_running=false
  local backup_failed=false

  # SQLite 数据库及 WAL/SHM 文件必须在同一个一致性时点复制。已有 backend 仅暂停备份所需的几秒，
  # 完成后立即恢复；后续镜像构建期间旧服务仍继续提供服务。
  if ! $DRY_RUN; then
    local backend_id
    backend_id=$(dc "ps -q backend 2>/dev/null || true" | head -1 | tr -d '[:space:]')
    if [ -n "${backend_id}" ]; then
      log_info "短暂停止 backend，以生成一致的 SQLite 备份..."
      dc "stop backend"
      backend_was_running=true
    fi
  fi

  remote_exec "mkdir -p ${BACKUP_DATA_DIR} ${BACKUP_APP_DIR}"
  remote_exec "if [ -d ${REMOTE_DATA_DIR} ]; then find ${REMOTE_DATA_DIR} -mindepth 1 -maxdepth 1 ! -name whisper-models ! -name cosyvoice-models ! -name modelscope-cache ! -name tts-cache -exec cp -a {} ${BACKUP_DATA_DIR}/ \\; 2>/dev/null; fi" || backup_failed=true
  remote_exec "if [ -d ${REMOTE_APP_DIR} ]; then cp -a ${REMOTE_APP_DIR}/. ${BACKUP_APP_DIR}/ 2>/dev/null; fi" || backup_failed=true

  if $backend_was_running; then
    dc "start backend"
    log_info "backend 已恢复运行"
  fi
  if $backup_failed; then
    log_error "服务器备份失败，已终止部署"
    return 1
  fi
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
  local dry_run_flag=""
  $DRY_RUN && dry_run_flag="--dry-run"

  rsync -avz --delete --itemize-changes ${dry_run_flag} \
    ${exclude_args[@]+"${exclude_args[@]}"} \
    "${LOCAL_PROJECT_ROOT}/" \
    "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_APP_DIR}/" | tee "${rsync_log}"

  SYNC_COUNT=$(grep -cE '^[<>][fcdLDS]' "${rsync_log}" 2>/dev/null || true)
  SYNC_COUNT=${SYNC_COUNT:-0}
  rm -f "${rsync_log}"
  if $DRY_RUN; then
    log_dry "预计 rsync 变更文件/目录数: ${SYNC_COUNT}"
  else
    log_info "rsync 完成，共变更 ${SYNC_COUNT} 个文件/目录"
  fi
}

init_remote_data_dir() {
  log_info "在服务器初始化 data/ 目录..."
  remote_exec "bash ${REMOTE_APP_DIR}/scripts/init-host-dir.sh --skip-mkcert ${REMOTE_DIR}"
}

sync_certs() {
  local local_data_root="${AI_TUTOR_HOME:-$HOME/.ai-english-tutor}/data"
  local local_cert="${local_data_root}/certs/fullchain.pem"
  local local_key="${local_data_root}/certs/privkey.pem"
  if [ ! -f "$local_cert" ] || [ ! -f "$local_key" ]; then
    log_warn "本地未发现 ${local_cert} / ${local_key}，跳过 HTTPS 部署"
    log_warn "  如需 HTTPS：先在本机跑 'pnpm setup' 生成 mkcert 证书，再重跑部署"
    return 0
  fi
  log_info "上传 mkcert 证书到 ${REMOTE_DATA_DIR}/certs/ ..."
  remote_exec "mkdir -p ${REMOTE_DATA_DIR}/certs"
  if $DRY_RUN; then
    log_dry "将 scp ${local_cert} ${local_key} -> ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DATA_DIR}/certs/"
  else
    scp "$local_cert" "$local_key" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DATA_DIR}/certs/"
  fi
  log_info "证书已上传，gateway 将自动启用 HTTPS (443)"
}

# ── Compose 叠加文件探测 ──
detect_compose_overlays() {
  local asr tts

  if $DRY_RUN; then
    # dry-run 时优先读取远端现有 .env（新配置尚未 scp）
    if remote_exec_real "[ -f ${REMOTE_ENV_FILE} ]" >/dev/null 2>&1; then
      asr=$(remote_exec_real "grep -E '^ASR_PROVIDER=' ${REMOTE_ENV_FILE} | tail -1 | cut -d= -f2 | tr -d '[:space:]'" || true)
      tts=$(remote_exec_real "grep -E '^TTS_PROVIDER=' ${REMOTE_ENV_FILE} | tail -1 | cut -d= -f2 | tr -d '[:space:]'" || true)
    elif [ -f "${LOCAL_ENV_TEMP}" ]; then
      asr=$(grep -E '^ASR_PROVIDER=' "${LOCAL_ENV_TEMP}" | tail -1 | cut -d= -f2 | tr -d '[:space:]' || true)
      tts=$(grep -E '^TTS_PROVIDER=' "${LOCAL_ENV_TEMP}" | tail -1 | cut -d= -f2 | tr -d '[:space:]' || true)
    else
      log_warn "dry-run：无 .env 预览，按仅主 compose 部署"
      return 0
    fi
  else
    if ! remote_exec_real "[ -f ${REMOTE_ENV_FILE} ]" >/dev/null 2>&1; then
      log_warn "远端无 .env，按仅主 compose 部署"
      return 0
    fi
    asr=$(remote_exec_real "grep -E '^ASR_PROVIDER=' ${REMOTE_ENV_FILE} | tail -1 | cut -d= -f2 | tr -d '[:space:]'" || true)
    tts=$(remote_exec_real "grep -E '^TTS_PROVIDER=' ${REMOTE_ENV_FILE} | tail -1 | cut -d= -f2 | tr -d '[:space:]'" || true)
  fi

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

# ── build 代理测试 ──
test_build_proxy() {
  local proxy="${BUILD_PROXY:-http://127.0.0.1:7890}"
  local test_url="https://registry.npmmirror.com"
  if [ "${BUILD_PROXY:-}" = "none" ]; then
    log_info "BUILD_PROXY=none，跳过代理测试"
    return 0
  fi
  log_info "测试 build 代理 ${proxy} ..."
  if remote_exec_real "curl -fsS -o /dev/null --max-time 5 --proxy ${proxy} ${test_url}" >/dev/null 2>&1; then
    log_info "代理可用"
  else
    log_error "代理测试失败：无法通过 ${proxy} 访问 ${test_url}"
    log_error "请确认宿主机代理已运行，或通过 BUILD_PROXY 指定可用代理"
    exit 1
  fi
  # CosyVoice 构建需 git clone GitHub，额外探测 github 可达性。
  # 主部署已与 cosyvoice 构建解耦（不构建 cosyvoice），GitHub 不可达不应阻塞主部署，仅 warn。
  # pnpm deploy:cosyvoice 实际构建时若 GitHub 不可达，会在 build 阶段（git clone）失败退出。
  if $ENABLE_COSYVOICE; then
    local gh_url="https://github.com"
    log_info "CosyVoice 启用：额外测试代理可达 ${gh_url} ..."
    if remote_exec_real "curl -fsS -o /dev/null --max-time 10 --proxy ${proxy} ${gh_url}" >/dev/null 2>&1; then
      log_info "GitHub 可达，CosyVoice 构建前置条件满足"
    else
      log_warn "代理无法访问 ${gh_url}：主部署不构建 cosyvoice 故不阻塞；若运行 pnpm deploy:cosyvoice，git clone GitHub 将失败"
    fi
  fi
  return 0
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
  if remote_exec_real "[ -f ${model_path} ]" >/dev/null 2>&1; then
    log_info "whisper 模型已存在，跳过下载"
    return 0
  fi
  if $DRY_RUN; then
    log_dry "whisper 模型缺失，将下载 ${WHISPER_MODEL_URL} 到 ${model_path}"
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
      'apk add --no-cache curl >/dev/null && \\
       curl -fL --retry 5 -o /models/${WHISPER_MODEL_FILE} \\
         ${WHISPER_MODEL_URL}'"

  ${GREEN}# 方案 2：换 hf-mirror.com（国内镜像，无需科学上网）${NC}
  ssh ${REMOTE_USER}@${REMOTE_HOST} \
    "docker run --rm -v ${model_dir}:/models alpine sh -c \
      'apk add --no-cache curl >/dev/null && \\
       curl -fL --retry 5 -o /models/${WHISPER_MODEL_FILE} \\
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

# ── CosyVoice 镜像引导 ──
ensure_cosyvoice_image() {
  if ! $ENABLE_COSYVOICE; then
    log_info "TTS 非 cosyvoice，跳过 CosyVoice 镜像检查"
    return 0
  fi
  log_info "检查 cosyvoice:local 镜像..."
  if remote_exec_real "docker inspect --type=image cosyvoice:local >/dev/null 2>&1"; then
    log_info "cosyvoice:local 已存在，将直接复用（不重新构建）"
    COSYVOICE_IMAGE_MISSING=false
    return 0
  fi
  # 镜像缺失：已与主部署解耦，不再自动构建（避免构建失败拖累主部署）。
  # 由独立的 pnpm deploy:cosyvoice 负责构建；主部署跳过 cosyvoice 服务，仅起核心服务。
  COSYVOICE_IMAGE_MISSING=true
  if $DRY_RUN; then
    log_dry "cosyvoice:local 缺失，主部署将跳过 cosyvoice 服务；请单独运行 pnpm deploy:cosyvoice 构建"
    return 0
  fi
  log_warn "cosyvoice:local 不存在，主部署将跳过 cosyvoice 服务（不阻塞）"
  log_warn "  请单独运行: pnpm deploy:cosyvoice  （构建并启动 cosyvoice，约 5-10 分钟）"
}

# ── schema 变更探测 ──
detect_schema_change() {
  local old_dir="${BACKUP_APP_DIR}/apps/tutor-server/src/db/migrations"
  local new_dir="${REMOTE_APP_DIR}/apps/tutor-server/src/db/migrations"
  local old_count new_count
  old_count=$(remote_exec_real "find '${old_dir}' -maxdepth 1 -name '*.sql' 2>/dev/null | wc -l" || echo 0)
  new_count=$(remote_exec_real "find '${new_dir}' -maxdepth 1 -name '*.sql' 2>/dev/null | wc -l" || echo 0)
  old_count=${old_count:-0}
  new_count=${new_count:-0}
  if [ "${new_count}" -gt "${old_count}" ]; then
    DB_SCHEMA_WILL_CHANGE=true
    log_warn "检测到新的数据库迁移文件（${old_count} -> ${new_count}），rollback 时将恢复 data 备份"
  else
    DB_SCHEMA_WILL_CHANGE=false
  fi
}

# ── Docker 启动 / 健康检查 / 回滚 ──
deploy_services() {
  log_info "在服务器上构建并启动服务..."
  log_info "compose 文件: $(compose_files)"

  local proxy="${BUILD_PROXY:-http://127.0.0.1:7890}"

  # 核心服务清单：主程序三件套 + whisper（whisper 为 pull 镜像，无需 build）。
  # cosyvoice 镜像由独立的 pnpm deploy:cosyvoice 构建，不纳入主部署 build/up，
  # 避免其构建失败拖累主部署；镜像已存在时 up -d 仍会一并拉起。
  local core_services="backend frontend gateway"
  $ENABLE_WHISPER && core_services="${core_services} whisper"

  if $DRY_RUN; then
    log_dry "将执行: docker compose build --build-arg HTTP_PROXY=${proxy} --build-arg HTTPS_PROXY=${proxy} ${core_services}（timeout ${BUILD_TIMEOUT}s）"
    log_dry "将执行: docker compose down"
    if $ENABLE_COSYVOICE && $COSYVOICE_IMAGE_MISSING; then
      log_dry "cosyvoice 镜像缺失，将仅 up 核心服务（不含 cosyvoice）: ${core_services}"
    else
      log_dry "将执行: docker compose up -d"
    fi
    return 0
  fi

  # ① 先 build（不停现有服务）：build 失败/超时时旧服务仍在运行，不宕机。
  #    BUILD_TIMEOUT 兜底防止 build 卡死（历史 buildkit 缓存损坏曾卡死 36 分钟）。
  # build 期走宿主机 mihomo 代理拉取海外源（Alpine/pypi 等）。
  # 通过 --build-arg 注入 HTTP_PROXY/HTTPS_PROXY：docker 会自动将其作为环境变量传入每个 RUN，
  # 仅作用于 build 容器（配合 build.network: host，127.0.0.1:7890 即宿主机 mihomo）。
  # 运行时容器不携带代理变量，避免 healthcheck（busybox wget 不认 NO_PROXY）走无效代理，
  # 也避免 Node.js 应用被 127.0.0.1:7890（bridge 容器内不可达）污染。
  # 注意：不能用 ~/.docker/config.json 的 proxies，它会被注入到运行时容器。
  # 代理地址可通过 BUILD_PROXY 环境变量覆盖。
  # 显式指定 core_services：cosyvoice 镜像由 pnpm deploy:cosyvoice 单独构建，不在此 build。
  if ! DC_TTY_TIMEOUT=${BUILD_TIMEOUT} dc_tty "build --build-arg HTTP_PROXY=${proxy} --build-arg HTTPS_PROXY=${proxy} ${core_services}"; then
    log_error "docker compose build 失败或超时（旧服务仍在运行，未切换）"
    return 1
  fi

  # ② build 成功后切换镜像：down 旧服务 + up 新镜像（此阶段失败需回滚）
  dc down
  if $ENABLE_COSYVOICE && $COSYVOICE_IMAGE_MISSING; then
    log_warn "cosyvoice:local 缺失，仅启动核心服务（不含 cosyvoice）；请随后运行 pnpm deploy:cosyvoice"
    if ! dc_tty "up -d ${core_services}"; then
      log_error "docker compose up 失败（启动失败）"
      return 2
    fi
  else
    if ! dc_tty "up -d"; then
      log_error "docker compose up 失败（启动失败）"
      return 2
    fi
  fi
  log_info "服务已启动（后台），等待健康检查"
}

check_health() {
  local attempt=1
  local healthy_count
  while [ ${attempt} -le ${HEALTH_CHECK_RETRIES} ]; do
    log_info "容器健康检查 ${attempt}/${HEALTH_CHECK_RETRIES}..."
    if $DRY_RUN; then
      log_dry "将执行: docker compose ps --format json backend gateway"
      healthy_count=2
    else
      healthy_count=$(dc "ps --format json backend gateway 2>/dev/null | grep -c '\"Health\":\"healthy\"' || true")
    fi
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

end_to_end_health_check() {
  log_info "执行端到端健康检查..."

  if $DRY_RUN; then
    log_dry "将执行: curl -fsS http://localhost:80/"
    log_dry "将执行: curl -fsS http://localhost:80/api/health"
    log_dry "将执行: curl -fsS http://localhost:80/api/config"
    if $ENABLE_COSYVOICE; then
      log_dry "将执行: curl -fsS -X POST http://localhost:50000/inference_sft -F spk_id=EnglishTutor"
    fi
    return 0
  fi

  # 1. gateway 首页
  if ! remote_exec_real "curl -fsS -o /dev/null http://localhost:80/"; then
    log_error "端到端检查失败：gateway 首页不可达"
    return 1
  fi
  log_info "gateway 首页可达"

  # 2. /api/health 结构化检查
  local health_response
  health_response=$(remote_exec_real "curl -fsS http://localhost:80/api/health" || true)
  if [ -z "${health_response}" ]; then
    log_error "端到端检查失败：/api/health 无响应"
    return 1
  fi

  # 检查每个 checks.*.ok 是否为 true
  local failed_checks
  failed_checks=$(echo "${health_response}" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    failed = [k for k, v in data.get('checks', {}).items() if not v.get('ok')]
    print(' '.join(failed))
except Exception as e:
    print('PARSE_ERROR')
" 2>/dev/null || true)

  if [ "${failed_checks}" = "PARSE_ERROR" ]; then
    log_warn "/api/health 返回非 JSON，跳过结构化检查"
  elif [ -n "${failed_checks}" ]; then
    log_error "端到端检查失败：/api/health 中以下检查未通过: ${failed_checks}"
    return 1
  else
    log_info "/api/health 所有检查通过"
  fi

  # 3. /api/config
  if ! remote_exec_real "curl -fsS -o /dev/null http://localhost:80/api/config"; then
    log_error "端到端检查失败：/api/config 不可达"
    return 1
  fi
  log_info "/api/config 可达"

  # 4. CosyVoice 可选探测（仅提示，不阻塞）
  if $ENABLE_COSYVOICE && ! $COSYVOICE_IMAGE_MISSING; then
    local cv_status
    cv_status=$(remote_exec_real "curl -s -o /dev/null -w '%{http_code}' -X POST -F 'spk_id=EnglishTutor' http://localhost:50000/inference_sft" || true)
    if [ "${cv_status}" = "422" ] || [ "${cv_status}" = "200" ]; then
      log_info "CosyVoice 端到端探测通过 (HTTP ${cv_status})"
    else
      log_warn "CosyVoice 端到端探测未通过 (HTTP ${cv_status})，不阻塞部署"
    fi
  elif $ENABLE_COSYVOICE && $COSYVOICE_IMAGE_MISSING; then
    log_warn "CosyVoice 镜像缺失，已跳过端到端探测；请运行 pnpm deploy:cosyvoice 后再验证"
  fi

  return 0
}

wait_cosyvoice_healthy() {
  if ! $ENABLE_COSYVOICE; then
    return 0
  fi
  if $COSYVOICE_IMAGE_MISSING; then
    log_info "cosyvoice 镜像缺失（已跳过启动），跳过健康等待"
    return 0
  fi
  if $DRY_RUN; then
    log_dry "将执行: 等待 cosyvoice 容器健康（模型加载约 90-120s）"
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
    status=$(remote_exec_real "docker inspect --format '{{.State.Health.Status}}' ${cv_container} 2>/dev/null" || true)
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
  status=$(remote_exec_real "docker inspect --format '{{.State.Health.Status}}' ${cv_container} 2>/dev/null" || true)
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
  log_error "部署失败，开始回滚到 ${BACKUP_APP_DIR}..."

  if $DRY_RUN; then
    log_dry "将执行: docker compose down"
    log_dry "将执行: 恢复 ${BACKUP_APP_DIR} -> ${REMOTE_APP_DIR}"
    if $DB_SCHEMA_WILL_CHANGE; then
      log_dry "将执行: 恢复 ${BACKUP_DATA_DIR} 中的配置与数据库，并保留模型和缓存目录（检测到 schema 变更）"
    fi
    log_dry "将执行: docker compose up -d"
    return 0
  fi

  dc down
  remote_exec "find ${REMOTE_APP_DIR} -mindepth 1 -delete && cp -a ${BACKUP_APP_DIR}/. ${REMOTE_APP_DIR}/"

  if [ "${RESTORE_DATA_ON_ROLLBACK:-false}" = "true" ] || $DB_SCHEMA_WILL_CHANGE; then
    log_warn "恢复部署前数据备份 ${BACKUP_DATA_DIR}..."
    remote_exec "mkdir -p ${REMOTE_DATA_DIR} && find ${REMOTE_DATA_DIR} -mindepth 1 -maxdepth 1 ! -name whisper-models ! -name cosyvoice-models ! -name modelscope-cache ! -name tts-cache -exec rm -rf {} + && cp -a ${BACKUP_DATA_DIR}/. ${REMOTE_DATA_DIR}/"
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
  if $DRY_RUN; then
    echo "================ 预计部署报告 ================"
  else
    echo "================ 部署报告 ================"
  fi
  echo "本地测试：          通过 (${test_duration}s)"
  echo "服务器：            ${REMOTE_USER}@${REMOTE_HOST}"
  echo "数据备份：          ${BACKUP_DATA_DIR}"
  echo "代码备份：          ${BACKUP_APP_DIR}"
  echo "代码变更文件数：    ${sync_count}"
  echo "部署耗时：          ${deploy_duration}s"
  if ! $DRY_RUN; then
    echo "容器状态："
    dc "ps --format 'table {{.Name}}\t{{.Status}}'" || true
    if $ENABLE_COSYVOICE && $COSYVOICE_IMAGE_MISSING; then
      echo "CosyVoice：         镜像缺失（已跳过，请运行 pnpm deploy:cosyvoice）"
    else
      echo "CosyVoice：         $(get_cosyvoice_health)"
    fi
  fi
  echo "结果：              ${status}"
  echo "=========================================="
}

# 主流程
deploy_main() {
  local start_time deploy_duration deploy_rc=0

  # 确保无论成功/失败都清理本地临时 .env 文件
  trap 'rm -f "${LOCAL_ENV_TEMP}"' EXIT

  check_git_clean
  check_ssh
  ensure_remote_dirs

  if $SKIP_TESTS; then
    log_warn "已指定 --skip-tests，跳过本地测试"
    TEST_DURATION=0
  else
    run_local_tests
  fi

  # 先备份，再改 .env，确保旧 .env 也进入备份
  backup_remote
  configure_remote_env

  start_time=$(date +%s)
  sync_code
  detect_schema_change
  init_remote_data_dir
  sync_certs
  detect_compose_overlays
  test_build_proxy
  ensure_whisper_model
  ensure_cosyvoice_image

  deploy_services || deploy_rc=$?
  if [ "${deploy_rc}" -eq 1 ]; then
    # build 失败/超时：旧服务仍在运行，无需回滚
    deploy_duration=$(($(date +%s) - start_time))
    print_report "构建失败（旧服务仍在运行）" "${TEST_DURATION}" "${SYNC_COUNT}" "${deploy_duration}"
    exit 1
  elif [ "${deploy_rc}" -ne 0 ]; then
    # up 失败：已 down，需回滚
    rollback
    deploy_duration=$(($(date +%s) - start_time))
    print_report "失败并已回滚" "${TEST_DURATION}" "${SYNC_COUNT}" "${deploy_duration}"
    exit 1
  fi

  if check_health; then
    wait_cosyvoice_healthy
    if end_to_end_health_check; then
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
  else
    rollback
    deploy_duration=$(($(date +%s) - start_time))
    print_report "失败并已回滚" "${TEST_DURATION}" "${SYNC_COUNT}" "${deploy_duration}"
    exit 1
  fi
}
