// Prettier 配置 —— 匹配项目现有代码风格
// （2 空格 / 单引号 / 无分号 / 无尾逗号）
/** @type {import('prettier').Config} */
export default {
  semi: false,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'none',
  printWidth: 100,
  endOfLine: 'lf',
  arrowParens: 'avoid',
  vueIndentScriptAndStyle: false,
  htmlWhitespaceSensitivity: 'css'
}
