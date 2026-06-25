#!/bin/bash
# ── AI English Tutor — 本地开发（无 Docker）──
# 同时启动后端和前端，不启动网关
#
# Usage: pnpm local  或  bash scripts/dev-local.sh
#
# Architecture:
#   Browser → Vite (6173) → proxy /api/* → Backend (3000)

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# 存储子进程 PID
PIDS=()

cleanup() {
    echo ""
    echo "🛑 停止所有服务..."
    for pid in "${PIDS[@]}"; do
        kill $pid 2>/dev/null &
    done
    wait 2>/dev/null
    echo "✅ 已停止"
    exit 0
}

trap cleanup EXIT INT TERM

echo "🚀 启动 AI English Tutor 本地开发环境"
echo "   后端:  http://localhost:3000"
echo "   前端:  http://localhost:6173"
echo ""
echo "   API 请求: Vite → Backend (直接代理，无需网关)"
echo "   按 Ctrl+C 停止所有服务"
echo ""

# 检查端口是否被占用，并显示占用进程信息和解除命令
check_port() {
    local port=$1
    local service_name=$2
    local pid=$(lsof -ti :$port -sTCP:LISTEN 2>/dev/null | head -1)
    if [ -n "$pid" ]; then
        local process_info=$(ps -p $pid -o comm= 2>/dev/null || echo "unknown")
        echo ""
        echo "❌ 错误: 端口 $port ($service_name) 已被占用"
        echo "   进程信息: PID $pid ($process_info)"
        echo ""
        echo "   解除占用，请运行以下命令之一:"
        echo "   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "   仅释放端口 $port:   kill -9 $pid"
        echo "   释放所有相关端口:   lsof -ti :$port | xargs kill -9"
        echo "   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        exit 1
    fi
}

check_port 3000 "后端服务"
check_port 6173 "前端服务"

# 启动后端
echo "▶ 启动后端..."
cd "$PROJECT_ROOT/apps/tutor-server"
npx tsx src/index.ts &
PIDS+=($!)
cd "$PROJECT_ROOT"

# 等待后端启动
echo "   等待后端启动..."
sleep 3

# 启动前端
echo "▶ 启动前端..."
cd "$PROJECT_ROOT/apps/tutor-app"
npx vite --host &
PIDS+=($!)
cd "$PROJECT_ROOT"

echo ""
echo "✅ 所有服务已启动"
echo ""
echo "   打开浏览器访问: http://localhost:6173"
echo ""

# 持续等待，直到收到退出信号
# 使用无限循环替代 wait -n，避免意外退出
while true; do
    # 检查子进程是否还在运行
    for pid in "${PIDS[@]}"; do
        if ! kill -0 $pid 2>/dev/null; then
            echo "⚠️  进程 $pid 已退出"
        fi
    done
    sleep 1
done
