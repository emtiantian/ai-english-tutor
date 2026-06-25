#!/bin/bash
# ── AI English Tutor — Local Development Gateway ──
# Starts nginx gateway in Docker, proxying /api/* to local backend.
#
# Usage:
#   ./gateway/dev.sh [port]        # Default port: 8080
#   ./gateway/dev.sh 9000          # Custom port
#
# Architecture:
#   Browser → Vite (6173) → proxy /api/* → Gateway (8080) → Backend (3000)
#
# The gateway handles CORS so the backend doesn't need to manage origins.

set -e

GATEWAY_PORT="${1:-8080}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🚀 Starting AI English Tutor Gateway"
echo "   Gateway:  http://localhost:${GATEWAY_PORT}"
echo "   Backend:  http://localhost:3000"
echo "   Frontend: http://localhost:6173 (Vite dev server)"
echo ""
echo "   API requests via Vite proxy → Gateway → Backend"
echo "   Press Ctrl+C to stop"
echo ""

# Run gateway container
# --add-host: map host.docker.internal to host machine
# -p: map host port to container port 80
docker run --rm \
    -p "${GATEWAY_PORT}:80" \
    --add-host=host.docker.internal:host-gateway \
    -e "BACKEND_URL=http://host.docker.internal:3000" \
    -e "FRONTEND_URL=http://host.docker.internal:6173" \
    -e "CORS_ORIGIN=*" \
    -v "${SCRIPT_DIR}/nginx.conf:/usr/local/openresty/nginx/conf/nginx.conf:ro" \
    -v "${SCRIPT_DIR}/cors.lua:/etc/nginx/cors.lua:ro" \
    --name ai-tutor-gateway \
    openresty/openresty:alpine
