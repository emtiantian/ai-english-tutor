# ── AI English Tutor — Nginx Gateway ──
# Handles CORS, reverse-proxies /api/* to backend,
# and serves frontend static files. Supports both HTTP (80) and
# HTTPS (443) simultaneously — HTTPS is auto-enabled when TLS certs
# are mounted at /etc/nginx/certs/{fullchain,privkey}.pem.
#
# Uses nginx:alpine instead of OpenResty to avoid slow/uncached
# openresty image pulls on deployment servers.

FROM nginx:alpine

# Install envsubst (provided by gettext in alpine)
RUN apk add --no-cache gettext

# Copy templates and entrypoint script
COPY gateway/nginx.conf        /etc/nginx/nginx.conf.template
COPY gateway/ssl.conf.template /etc/nginx/ssl.conf.template
COPY gateway/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Create directory for frontend static files (fallback if not proxied)
RUN mkdir -p /usr/share/nginx/html

# Remove default nginx site to avoid port/config conflicts
RUN rm -f /etc/nginx/conf.d/default.conf

# Default environment variables
ENV BACKEND_URL=http://backend:3000
ENV FRONTEND_URL=http://frontend:80
ENV CORS_ORIGIN=*
ENV SERVER_NAME=_
ENV SERVE_STATIC=on

EXPOSE 80 443

# Render nginx config (and optional ssl.conf) then exec nginx
ENTRYPOINT ["/docker-entrypoint.sh"]
