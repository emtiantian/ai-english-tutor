#!/bin/bash
# ── AI English Tutor - 本地开发（无 Docker）──
# 同时启动后端和前端，不启动网关
#
# Usage: pnpm local  或  bash scripts/dev/start.sh
#
# Architecture:
#   Browser -> Vite (6173) -> proxy /api/* -> Backend (3000)

set -eo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

# 存储子进程 PID
PIDS=()

cleanup() {
    echo ""
    echo "🛑 停止所有服务..."
    for pid in "${PIDS[@]+${PIDS[@]}}"; do
        [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null || true
    echo "✅ 已停止"
}

trap cleanup EXIT INT TERM

echo "🚀 启动 AI English Tutor 本地开发环境"
echo "   后端:  http://localhost:3000"
echo "   前端:  http://localhost:6173"
echo ""
echo "   API 请求: Vite -> Backend (直接代理，无需网关)"
echo "   按 Ctrl+C 停止所有服务"
echo ""

# 检查端口是否被占用，并显示占用进程信息和解除命令
check_port() {
    local port=$1
    local service_name=$2
    local pid
    pid=$(lsof -ti :$port -sTCP:LISTEN 2>/dev/null | head -1) || true
    if [ -n "$pid" ]; then
        local process_info
        process_info=$(ps -p $pid -o comm= 2>/dev/null || echo "unknown")
        echo ""
        echo "❌ 错误: 端口 $port ($service_name) 已被占用"
        echo "   进程信息: PID $pid ($process_info)"
        echo "   解除: pnpm dev:clean  或  kill -9 $pid"
        exit 1
    fi
}

check_port 3000 "后端服务"
check_port 6173 "前端服务"

# 启动后端：走 pnpm workspace 复用各包 dev 脚本，避免 npx 解析开销
echo "▶ 启动后端..."
pnpm --filter @ai-english-tutor/server dev &
PIDS+=($!)

# 轮询后端 health 接口就绪，替代硬编码 sleep
echo "   等待后端就绪..."
ready=false
for _ in $(seq 1 60); do
    if curl -sf http://localhost:3000/api/health >/dev/null 2>&1; then
        ready=true
        break
    fi
    # 后端进程若提前退出则不再空等
    if ! kill -0 "${PIDS[0]}" 2>/dev/null; then
        echo "⚠️  后端进程已退出"
        break
    fi
    sleep 0.5
done
if $ready; then
    echo "   ✅ 后端已就绪"
else
    echo "   ⚠️  后端未在 30s 内就绪，仍继续启动前端（可能仍在编译）"
fi

# 启动前端
echo "▶ 启动前端..."
pnpm --filter tutor-app dev &
PIDS+=($!)

echo ""
echo "✅ 所有服务已启动"
echo "   打开浏览器访问: http://localhost:6173"
echo ""

# 任一子进程退出即整体退出，避免留下僵尸守护
while true; do
    for pid in "${PIDS[@]}"; do
        if ! kill -0 "$pid" 2>/dev/null; then
            echo "⚠️  进程 $pid 已退出，停止全部服务"
            exit 1
        fi
    done
    sleep 1
done
