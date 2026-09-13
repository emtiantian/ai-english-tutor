#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN="${1:-${CERT_DOMAIN:-emengtt.com}}"
AI_TUTOR_HOME="${AI_TUTOR_HOME:-/home/haohe/data/.ai-english-tutor}"
APP_DIR="${AI_TUTOR_APP:-$AI_TUTOR_HOME/app}"
CERT_DIR="${AI_TUTOR_CERT_DIR:-$AI_TUTOR_HOME/data/certs}"
export AI_TUTOR_HOME

fail() { printf '证书检查失败: %s\n' "$1" >&2; exit 1; }
[[ -r "$CERT_DIR/fullchain.pem" ]] || fail "缺少 $CERT_DIR/fullchain.pem"
[[ -r "$CERT_DIR/privkey.pem" ]] || fail "缺少 $CERT_DIR/privkey.pem"

printf '域名: %s\n证书目录: %s\n' "$DOMAIN" "$CERT_DIR"
openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -subject -issuer -dates -ext subjectAltName
openssl x509 -in "$CERT_DIR/fullchain.pem" -checkend 1209600 -noout \
  || fail '证书将在 14 天内到期'

cd "$APP_DIR"
docker compose config --quiet
docker compose ps --status running gateway >/dev/null \
  || fail 'gateway 容器未运行'
docker compose exec -T gateway nginx -t
printf '证书文件、Compose 配置和 Nginx 配置检查通过。\n'
