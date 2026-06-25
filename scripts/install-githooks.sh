#!/usr/bin/env bash
# ── 安装仓库内 git hooks ──
# 把 .githooks/ 设为 git hooks 目录，团队成员每人跑一次即可。

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOKS_DIR="${REPO_ROOT}/.githooks"

if [ ! -d "${HOOKS_DIR}" ]; then
  echo "❌ 没找到 ${HOOKS_DIR}/" >&2
  exit 1
fi

# 给所有 hook 文件加可执行权限（除 .md）
find "${HOOKS_DIR}" -type f ! -name "*.md" -exec chmod +x {} \;

# 配置 git 使用此目录
git -C "${REPO_ROOT}" config core.hooksPath .githooks

echo "✅ Git hooks 已安装"
echo "   core.hooksPath = .githooks"
echo ""
echo "已启用的 hook:"
find "${HOOKS_DIR}" -type f ! -name "*.md" -perm -u+x | while read -r f; do
  echo "   • $(basename "$f")"
done
echo ""
echo "卸载: git config --unset core.hooksPath"
echo "查看说明: cat .githooks/README.md"
