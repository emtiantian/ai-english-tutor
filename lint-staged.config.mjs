// lint-staged 配置 —— 仅校验 git 暂存文件
// 由 .githooks/pre-commit 在 git commit 前调用。
export default {
  // TS / Vue：先 eslint 修复，再 prettier 格式化
  '*.{ts,mts,cts,vue}': ['eslint --fix', 'prettier --write'],
  // 其余文本文件：仅 prettier 格式化
  '*.{js,mjs,cjs,json,jsonc,md,css,scss,html,yml,yaml}': ['prettier --write']
}
