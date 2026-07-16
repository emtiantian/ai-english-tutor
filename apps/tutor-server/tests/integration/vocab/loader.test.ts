import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTestEnv } from '@tests/helpers/env.js'
import { REPO_ROOT } from '@tests/helpers/paths.js'

describe('vocab loader', () => {
  const env = createTestEnv('vocab-loader')
  let tmpRoot: string
  let configDir: string
  let defaultDir: string

  beforeAll(() => {
    env.setup()
    tmpRoot = env.root
    configDir = join(tmpRoot, 'config')
    defaultDir = join(tmpRoot, 'default')
    mkdirSync(join(configDir, 'vocab'), { recursive: true })
    mkdirSync(defaultDir, { recursive: true })
  })

  afterAll(() => {
    env.cleanup()
  })

  function writeVocab(vocabDir: string, level: string, word: string): void {
    const data = {
      level,
      levelNum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].indexOf(level) + 1,
      description: 'test',
      wordCount: 1,
      words: [{ word, meaning: 'test', pos: 'noun', topic: 'test' }],
    }
    writeFileSync(join(vocabDir, `${level}.json`), JSON.stringify(data))
  }

  it('falls back to DEFAULT_VOCAB_DIR when only it has files', async () => {
    process.env.DEFAULT_VOCAB_DIR = defaultDir
    process.env.CONFIG_DIR = configDir
    const { getVocabularyByLevel } = await import('@/vocab/loader.js')

    writeVocab(defaultDir, 'A1', 'default-a1')
    const a1 = getVocabularyByLevel('A1')
    expect(a1.words[0].word).toBe('default-a1')
  })

  it('prefers CONFIG_DIR/vocab over DEFAULT_VOCAB_DIR', async () => {
    writeVocab(defaultDir, 'B1', 'default-b1')
    writeVocab(join(configDir, 'vocab'), 'B1', 'config-b1')
    const { getVocabularyByLevel } = await import('@/vocab/loader.js')
    const b1 = getVocabularyByLevel('B1')
    expect(b1.words[0].word).toBe('config-b1')
  })

  it('loads default directory from repo root when DEFAULT_VOCAB_DIR is unset', async () => {
    const { getVocabularyByLevel } = await import('@/vocab/loader.js')
    const repoC1 = join(REPO_ROOT, 'config', 'vocab', 'C1.json')
    if (existsSync(repoC1)) {
      delete (process.env as Record<string, string | undefined>).DEFAULT_VOCAB_DIR
      const c1 = getVocabularyByLevel('C1')
      expect(c1.words.length).toBeGreaterThan(0)
      expect(c1.level).toBe('C1')
    } else {
      console.log('⚠️  仓库根 config/vocab/C1.json 不存在，跳过默认路径推导验证')
    }
  })
})
