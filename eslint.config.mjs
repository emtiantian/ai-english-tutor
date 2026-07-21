// ESLint flat config（ESLint 9）
// 仓库根单一配置，覆盖 apps/tutor-app（Vue 3 + TS）、apps/tutor-server（TS）、packages/shared（TS）。
// 风格：非类型感知规则（快，适合 pre-commit）；类型检查交给 vue-tsc / tsc --noEmit（见 pnpm typecheck）。
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import eslintConfigPrettier from 'eslint-config-prettier'

export default tseslint.config(
  // ── 全局忽略 ──
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/*.d.ts',
      // 第三方 Live2D / Cubism 框架源码，不入校验
      'apps/tutor-app/src/lib/cubism-framework/**',
      // 运行时数据 / 导出产物
      'data/**',
      '.dev-data/**',
      'export/**',
      // 部署 / 网关配置（非 TS 源码）
      'gateway/**',
      // 前端静态资源（含第三方 min.js 库，如 live2dcubismcore.min.js）
      'apps/tutor-app/public/**',
      // 前端诊断 / 临时工具脚本
      'apps/tutor-app/scripts/**'
    ]
  },

  // ── 基础 JS 推荐规则 ──
  js.configs.recommended,

  // ── TypeScript 推荐规则（非类型感知）──
  ...tseslint.configs.recommended,

  // ── Vue 推荐规则（自带 vue-eslint-parser）──
  ...pluginVue.configs['flat/recommended'],

  // ── Vue SFC 的 <script> 块用 TS parser 解析 ──
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser
      }
    }
  },

  // ── 项目通用规则微调 ──
  {
    rules: {
      // 未使用变量：警告，允许下划线前缀占位
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],
      // 项目快速迭代期，暂不强制禁止 any
      '@typescript-eslint/no-explicit-any': 'off',

      // ── TS 项目不适用的纯误报规则（typescript-eslint 官方建议禁用）──
      // eslint 无法解析 TS 类型 / 全局声明，no-undef 在 TS 文件上误报严重
      'no-undef': 'off',
      // TS 编译器已覆盖重声明检测，eslint 版 no-redeclare 在 TS 上误报
      'no-redeclare': 'off',
      // 空接口继承（interface X extends Y {}）是项目 Provider 模式的合法用法
      // （CLAUDE.md: LLM 优先继承 openai-base.ts），允许单继承空接口
      '@typescript-eslint/no-empty-object-type': [
        'error',
        { allowInterfaces: 'with-single-extends' }
      ],

      // ── ESLint 10 / typescript-eslint v8 新规则，历史代码误报多，降为 warn 渐进清理 ──
      // 跨控制流「无用赋值」检测，新规则成熟度不足，误判多
      'no-useless-assignment': 'warn',
      // 项目存在大量合法表达式调用风格（如 x && fn()），保留为 warn
      '@typescript-eslint/no-unused-expressions': 'warn',
      'no-unused-expressions': 'off',
      // while ((x = next())) 合法模式较多，降为 warn
      'no-cond-assign': 'warn',

      // 后端用 pino，前端偶有调试，不限制 console
      'no-console': 'off'
    }
  },

  // ── 测试文件：类型宽松，允许 @ts-nocheck（测试 mock 不强制类型检查）──
  {
    files: ['**/__tests__/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off'
    }
  },

  // ── 关闭与 Prettier 冲突的格式化规则（必须放最后）──
  eslintConfigPrettier
)
