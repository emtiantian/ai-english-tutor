import assert from 'node:assert'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..')

// 在导入 config/loader 之前设置环境变量，确保它们被读取。
const tmpRoot = mkdtempSync(join(tmpdir(), 'loader-test-'))
const configDir = join(tmpRoot, 'config')
const defaultDir = join(tmpRoot, 'default')

mkdirSync(join(configDir, 'vocab'), { recursive: true })
mkdirSync(defaultDir, { recursive: true })

process.env.NODE_ENV = 'development'
process.env.CONFIG_DIR = configDir
process.env.DEFAULT_VOCAB_DIR = defaultDir

const { getVocabularyByLevel } = await import('./loader.js')

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const

function writeVocab(vocabDir: string, level: string, word: string): void {
  const data = {
    level,
    levelNum: LEVELS.indexOf(level as (typeof LEVELS)[number]) + 1,
    description: 'test',
    wordCount: 1,
    words: [{ word, meaning: 'test', pos: 'noun', topic: 'test' }],
  }
  writeFileSync(join(vocabDir, `${level}.json`), JSON.stringify(data))
}

function cleanup(): void {
  rmSync(tmpRoot, { recursive: true, force: true })
}

async function main(): Promise<void> {
  try {
    // 1. 仅 DEFAULT_VOCAB_DIR 有文件时应能回退加载
    writeVocab(defaultDir, 'A1', 'default-a1')
    const a1 = getVocabularyByLevel('A1')
    assert.strictEqual(a1.words[0].word, 'default-a1', 'A1 应回退到 DEFAULT_VOCAB_DIR')

    // 2. CONFIG_DIR/vocab 优先级高于 DEFAULT_VOCAB_DIR
    writeVocab(defaultDir, 'B1', 'default-b1')
    writeVocab(join(configDir, 'vocab'), 'B1', 'config-b1')
    const b1 = getVocabularyByLevel('B1')
    assert.strictEqual(b1.words[0].word, 'config-b1', 'B1 应优先使用 CONFIG_DIR')

    // 3. 不设置 DEFAULT_VOCAB_DIR 时，loader 应从仓库根 config/vocab/ 推导默认目录
    const repoC1 = join(REPO_ROOT, 'config', 'vocab', 'C1.json')
    if (existsSync(repoC1)) {
      delete (process.env as Record<string, string | undefined>).DEFAULT_VOCAB_DIR
      const c1 = getVocabularyByLevel('C1')
      assert.strictEqual(c1.words.length > 0, true, 'C1 应能从仓库根 config/vocab/ 加载')
      assert.strictEqual(c1.level, 'C1', 'C1 等级信息应正确')
    } else {
      // 在 CI 或非常规工作目录中跳过此项验证
      console.log('⚠️  仓库根 config/vocab/C1.json 不存在，跳过默认路径推导验证')
    }

    console.log('✅ loader.test.ts 全部通过')
  } finally {
    cleanup()
  }
}

main().catch((err) => {
  console.error(err)
  cleanup()
  process.exit(1)
})
