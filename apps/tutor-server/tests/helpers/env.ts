import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export interface TestEnv {
  root: string
  path(name: string): string
  setup(overrides?: Record<string, string>): void
  cleanup(): void
}

/**
 * 为单个测试文件创建隔离的临时运行环境。
 *
 * 注意：本文件禁止静态 import 任何 src/ 下的生产模块，
 * 只能操作 process.env 和文件系统。依赖 env 的模块必须在
 * 调用 env.setup() 之后再动态 import。
 */
export function createTestEnv(prefix: string): TestEnv {
  const root = mkdtempSync(join(tmpdir(), `tutor-${prefix}-${randomUUID()}`))

  return {
    root,
    path: (name: string) => join(root, name),
    setup: (overrides: Record<string, string> = {}) => {
      // 安全默认值：避免写入 ~/.ai-english-tutor 或项目 .dev-data
      process.env.NODE_ENV = 'test'
      process.env.LOG_LEVEL = 'silent'
      process.env.LLM_PROVIDER = 'mock'
      process.env.TTS_PROVIDER = 'browser'
      process.env.ASR_PROVIDER = 'browser'
      process.env.CORS_ORIGIN = '*'

      process.env.DATA_DIR = root
      process.env.DB_PATH = join(root, 'tutor.db')
      process.env.TTS_CACHE_DIR = join(root, 'tts-cache')
      process.env.LINE_POOL_DIR = join(root, 'line-pool')
      process.env.CONFIG_DIR = root
      process.env.PORT = '0'

      for (const [key, value] of Object.entries(overrides)) {
        process.env[key] = value
      }
    },
    cleanup: () => {
      rmSync(root, { recursive: true, force: true })
    },
  }
}
