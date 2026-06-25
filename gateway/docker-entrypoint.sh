#!/bin/sh
# ── AI English Tutor — Gateway entrypoint ──
# 1. envsubst the main nginx.conf template (substitutes ${BACKEND_URL},
#    ${FRONTEND_URL}, ${CORS_ORIGIN}, ${SERVER_NAME}).
# 2. If /etc/nginx/certs/{fullchain,privkey}.pem exist, render the
#    443 server block from ssl.conf.template into
#    /etc/nginx/conf.d/ssl.conf so HTTPS is enabled.
# 3. Otherwise remove any stale ssl.conf so the gateway stays
#    HTTP-only (no crash from a missing ssl_certificate directive).
# 4. exec nginx in the foreground.

set -e

mkdir -p /etc/nginx/conf.d

# 1. Render main config
envsubst '$BACKEND_URL $FRONTEND_URL $CORS_ORIGIN $SERVER_NAME' \
    < /etc/nginx/nginx.conf.template \
    > /etc/nginx/nginx.conf

# 2/3. Render (or remove) HTTPS config based on cert presence
if [ -f /etc/nginx/certs/fullchain.pem ] && [ -f /etc/nginx/certs/privkey.pem ]; then
    echo "✅ TLS 证书已挂载 (/etc/nginx/certs/)，启用 HTTPS (443)"
    envsubst '$SERVER_NAME' \
        < /etc/nginx/ssl.conf.template \
        > /etc/nginx/conf.d/ssl.conf
else
    echo "ℹ️  /etc/nginx/certs/ 下未发现证书，仅启用 HTTP (80)"
    rm -f /etc/nginx/conf.d/ssl.conf
fi

# 4. Hand off to nginx
exec nginx -g 'daemon off;'
