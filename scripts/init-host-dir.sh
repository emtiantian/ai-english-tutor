#!/bin/bash
# ── AI English Tutor — 初始化宿主机配置目录 ──
# 创建 ~/.ai-english-tutor/data/ 并复制默认配置和数据文件
#
# 目录布局对齐 docker-compose.yml：
#   - 卷挂载: ~/.ai-english-tutor/data → /app/data
#   - 容器内: CONFIG_DIR=/app/data, DATA_DIR=/app/data
#   所有用户可编辑的配置（.env / persona.json / scenarios.json / vocab/）
#   都必须放在 data/ 下，否则容器读不到。
#
# Usage: bash scripts/init-host-dir.sh [自定义路径]
#   默认: ~/.ai-english-tutor/
#   示例: bash scripts/init-host-dir.sh /opt/ai-tutor

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TUTOR_HOME="${1:-$HOME/.ai-english-tutor}"
DATA_DIR="$TUTOR_HOME/data"

echo "📁 初始化宿主机配置目录: $TUTOR_HOME"
echo "   （所有运行时配置统一收敛到 data/ 子目录）"

# 创建目录结构
mkdir -p "$DATA_DIR/vocab"
mkdir -p "$DATA_DIR/tts-cache"
mkdir -p "$DATA_DIR/certs"
# 本地 ASR/TTS 模型目录（whisper / cosyvoice 的 bind mount 落点；
# 预先按当前用户创建，避免 docker 首次挂载时以 root 自动创建导致写权限问题）
mkdir -p "$DATA_DIR/whisper-models"
mkdir -p "$DATA_DIR/cosyvoice-models"
mkdir -p "$DATA_DIR/modelscope-cache"

# 复制 .env 模板（不覆盖已有文件）
if [ ! -f "$DATA_DIR/.env" ]; then
    cp "$PROJECT_ROOT/.env.example" "$DATA_DIR/.env"
    echo "   ✅ 已创建 data/.env（从模板复制；如需私有 provider 再填 API keys，浏览器默认栈免 key）"
else
    echo "   ⏭️  data/.env 已存在，跳过"
fi

# 复制默认词汇表（不覆盖已有文件）
VOCAB_SRC="$PROJECT_ROOT/config/vocab"
COPIED=0
for f in "$VOCAB_SRC"/*.json; do
    fname="$(basename "$f")"
    if [ ! -f "$DATA_DIR/vocab/$fname" ]; then
        cp "$f" "$DATA_DIR/vocab/$fname"
        COPIED=$((COPIED + 1))
    fi
done
if [ $COPIED -gt 0 ]; then
    echo "   ✅ 已复制 $COPIED 个词汇表文件到 data/vocab/"
else
    echo "   ⏭️  data/vocab/ 词汇表已存在，跳过"
fi

# 复制角色配置（不覆盖已有文件）
if [ ! -f "$DATA_DIR/persona.json" ]; then
    cp "$PROJECT_ROOT/packages/shared/src/persona-default.json" "$DATA_DIR/persona.json"
    echo "   ✅ 已复制 data/persona.json（角色配置，可自定义人设、提示词、音色）"
else
    echo "   ⏭️  data/persona.json 已存在，跳过"
fi

# 复制场景配置（不覆盖已有文件）
if [ ! -f "$DATA_DIR/scenarios.json" ]; then
    cp "$PROJECT_ROOT/packages/shared/src/scenarios-default.json" "$DATA_DIR/scenarios.json"
    echo "   ✅ 已复制 data/scenarios.json（场景配置，可自定义场景）"
else
    echo "   ⏭️  data/scenarios.json 已存在，跳过"
fi

# ── mkcert 自签证书（HTTPS 可选启用）──
# 检测 mkcert，存在且未生成过证书时自动签一对覆盖 localhost 的证书
# 放到 $DATA_DIR/certs/，gateway 容器会挂载这个目录到 /etc/nginx/certs/
# mkcert 不存在时主动询问用户是否安装，避免静默失败
ensure_mkcert_certs() {
  local cert_file="$DATA_DIR/certs/fullchain.pem"
  local key_file="$DATA_DIR/certs/privkey.pem"
  if [ -f "$cert_file" ] && [ -f "$key_file" ]; then
    echo "   ⏭️  data/certs/ 证书已存在，跳过 mkcert"
    return 0
  fi
  if command -v mkcert >/dev/null 2>&1; then
    echo "   🔐 正在用 mkcert 生成自签证书..."
    if mkcert -cert-file "$cert_file" -key-file "$key_file" localhost 127.0.0.1 ::1 2>&1 | sed 's/^/      /'; then
      echo "   ✅ 已生成证书：$cert_file"
      echo "      （首次使用 mkcert 需先跑 'mkcert -install' 把根 CA 装到系统/浏览器信任库，否则浏览器会报'不安全'）"
    else
      echo "   ⚠️  mkcert 生成失败，请检查 'mkcert -install' 是否已跑过；HTTPS 暂不可用"
    fi
    return 0
  fi

  # ── mkcert 缺失：主动询问 + 提供完整使用说明 ──
  echo ""
  echo "   ⚠️  未检测到 mkcert，HTTPS 证书无法自动生成"
  echo "      （容器会降级为仅 HTTP 模式，docker compose up 后只有 80 端口可用）"
  echo ""
  echo "   ┌─ mkcert 是干嘛的 ─────────────────────────────────────────┐"
  echo "   │ 生成本地受信任的自签证书，浏览器访问 https:// 不报'不安全'  │"
  echo "   │ 证书放 $DATA_DIR/certs/，gateway 容器会自动挂载             │"
  echo "   └──────────────────────────────────────────────────────────┘"
  echo ""
  local os_type
  os_type="$(uname -s)"
  if [ "$os_type" = "Darwin" ]; then
    echo "   📦 macOS 安装方式（推荐 Homebrew）："
    echo "        brew install mkcert"
    echo "        mkcert -install     # 装根 CA 到系统钥匙串（一次性）"
    echo ""
  else
    echo "   📦 Linux 安装方式："
    echo "        # Ubuntu/Debian (需要 go 或直接下二进制)"
    echo "        sudo apt install mkcert libnss3-tools    # 较新发行版"
    echo "        # 或 GitHub release（最通用）"
    echo "        curl -L https://github.com/FiloSottile/mkcert/releases/latest/download/mkcert-v1.4.4-linux-amd64 \\"
    echo "          -o ~/.local/bin/mkcert && chmod +x ~/.local/bin/mkcert"
    echo "        mkcert -install     # 装根 CA 到系统/浏览器信任库（一次性）"
    echo ""
  fi
  echo "   ✅ 装完后任选其一继续："
  echo "        1) 重跑本脚本：bash scripts/init-host-dir.sh"
  echo "        2) 手动签发："
  echo "             mkcert -cert-file $cert_file \\"
  echo "                      -key-file  $key_file  localhost 127.0.0.1 ::1"
  echo ""
  echo "   💡 不装也行：纯 HTTP 部署（http://<host>）功能完全一致，只是浏览器地址栏没有🔒"
  echo ""

  # 主动询问：现在要不要尝试装？默认 N（避免脚本里跑 sudo/brew 让人吃惊）
  # ⚠ 非交互式运行（如部署脚本经 `ssh host "bash init-host-dir.sh"` 调用，stdin 非 TTY）
  #   时绝不能 read，否则会永久阻塞等待键盘输入。此处直接按「跳过安装」处理：
  #   部署侧的 sync_certs 会把本地 mkcert 证书 scp 上来，服务器本身无需装 mkcert。
  local try_install
  if [ ! -t 0 ]; then
    echo "   ⏭️  非交互式运行（无 TTY），跳过 mkcert 安装询问"
    echo "      （HTTPS 证书由部署脚本从本地上传；服务器无需安装 mkcert）"
    echo ""
    return 0
  fi
  read -r -p "   现在尝试安装 mkcert 吗？(y/N) " try_install
  case "${try_install}" in
    y|Y|yes|YES)
      echo ""
      if [ "$os_type" = "Darwin" ]; then
        if command -v brew >/dev/null 2>&1; then
          echo "   ▶️  brew install mkcert ..."
          if brew install mkcert; then
            echo "   ✅ mkcert 已安装"
            mkcert -install || echo "   ⚠️  'mkcert -install' 失败，可能需要 sudo 手动跑"
            # 直接生成证书
            if mkcert -cert-file "$cert_file" -key-file "$key_file" localhost 127.0.0.1 ::1 2>&1 | sed 's/^/      /'; then
              echo "   ✅ 已生成证书：$cert_file"
            fi
          else
            echo "   ⚠️  brew install 失败，请按上面的'手动签发'命令完成"
          fi
        else
          echo "   ⚠️  未检测到 Homebrew，请手动安装 mkcert 后重跑本脚本"
        fi
      else
        echo "   ⚠️  Linux 发行版众多，未自动安装；请按上面的'Linux 安装方式'手动执行后重跑本脚本"
      fi
      ;;
    *)
      echo "   ⏭️  跳过安装。稍后装好再跑 'bash scripts/init-host-dir.sh' 生成证书"
      ;;
  esac
  echo ""
}
ensure_mkcert_certs

# ── 旧布局迁移提示 ──
# v1 把配置直接放在 $TUTOR_HOME 下，现在统一移到 data/。
# 如果旧文件还在，提醒用户手工迁移（不自动覆盖以免冲突）。
LEGACY_FILES=()
for legacy in ".env" "persona.json" "scenarios.json"; do
    if [ -f "$TUTOR_HOME/$legacy" ] && [ "$TUTOR_HOME/$legacy" != "$DATA_DIR/$legacy" ]; then
        LEGACY_FILES+=("$legacy")
    fi
done
if [ -d "$TUTOR_HOME/vocab" ] && [ "$TUTOR_HOME/vocab" != "$DATA_DIR/vocab" ]; then
    LEGACY_FILES+=("vocab/")
fi
if [ ${#LEGACY_FILES[@]} -gt 0 ]; then
    echo ""
    echo "⚠️  检测到旧布局残留文件（直接放在 $TUTOR_HOME/ 下）："
    for f in "${LEGACY_FILES[@]}"; do
        echo "      $TUTOR_HOME/$f"
    done
    echo "   这些文件 docker 容器读不到（容器只挂载 data/）。"
    echo "   请手工对比后迁移到 $DATA_DIR/，确认无冲突再删除旧文件。"
fi

echo ""
echo "✅ 初始化完成！目录结构："
echo ""
echo "   $TUTOR_HOME/"
echo "   └── data/                ← 所有运行时配置和持久化数据"
echo "       ├── .env              ← 运行配置（部署脚本可能已交互式写好；浏览器默认栈免 key）"
echo "       ├── persona.json      ← 角色配置（人设、提示词、音色描述）"
echo "       ├── scenarios.json    ← 场景配置（可新增自定义场景）"
echo "       ├── vocab/            ← 词汇表（可自定义）"
echo "       ├── tts-cache/        ← TTS 缓存（自动生成）"
echo "       ├── whisper-models/   ← 本地 Whisper ASR 模型（ASR=whisper 时下载到此）"
echo "       ├── cosyvoice-models/ ← CosyVoice 预置模型目录（pretrained_models）"
echo "       ├── modelscope-cache/ ← CosyVoice 的 modelscope 下载缓存（命中即免重下 ~11G）"
echo "       ├── certs/            ← TLS 证书（mkcert 自签；HTTPS 可选启用）"
echo "       │   ├── fullchain.pem ←   gateway 容器挂载到 /etc/nginx/certs/"
echo "       │   └── privkey.pem"
echo "       └── tutor.db          ← SQLite 数据库（首次启动自动生成）"
echo ""
echo "下一步："
echo "   1. （可选）编辑 $DATA_DIR/.env 填入 API keys"
echo "      —— 部署脚本已交互式配置、或使用浏览器默认栈（ASR/TTS 免 key）时可跳过"
echo "   2. （可选）编辑 data/persona.json 自定义角色人设和音色"
echo "   3. （可选）编辑 data/scenarios.json 添加自定义场景"
echo "   4. 运行 docker compose up --build"
echo ""
echo "注意：persona.json / scenarios.json 修改后需 docker compose restart backend 才能生效。"
