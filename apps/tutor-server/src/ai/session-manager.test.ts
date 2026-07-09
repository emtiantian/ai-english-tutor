import assert from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmpDir = mkdtempSync(join(tmpdir(), 'tutor-scenario-test-'))
process.env.DB_PATH = join(tmpDir, 'test.db')

// 动态导入，确保在 config/db 模块求值前设置 DB_PATH。
const { initSchema, closeDb } = await import('../db/index.js')
const { SessionManager } = await import('./session-manager.js')
type ScenarioState = import('./session-manager.js').ScenarioState

function makeScenario(): ScenarioState {
  return {
    id: 'restaurant-ordering',
    name: '餐厅点餐',
    icon: '🍽️',
    targetWords: ['coffee', 'tea', 'water', 'bread', 'please', 'thank'],
    maxTurns: 20,
    objectives: [
      {
        id: 'order-drink',
        description: '点一杯饮品',
        descriptionEn: 'Order a drink',
        keywords: ['coffee', 'tea', 'water'],
        targetWords: ['coffee', 'tea', 'water'],
      },
    ],
    turnsCount: 3,
    wordsUsed: new Set(['coffee', 'please']),
  }
}

async function main(): Promise<void> {
  initSchema()

  const manager = new SessionManager()
  const sessionId = 'test-scenario-session'
  const scenario = makeScenario()
  const session = {
    level: 2,
    history: [] as Array<{ role: 'user' | 'assistant'; content: string }>,
    vocabulary: new Set<string>(),
    voiceDesign: 'calm-friendly',
    scenario,
  }

  manager.set(sessionId, session)
  manager.saveSessionToDb(sessionId, session.level, 'lazy-mature', session.voiceDesign)
  manager.saveScenarioState(sessionId, session.scenario)

  // 模拟一个全新内存缓存的新服务端进程。
  const restoredManager = new SessionManager()
  const restored = restoredManager.getOrCreate(sessionId, session.level)

  assert(restored.scenario, 'scenario should be restored from DB')
  assert.strictEqual(restored.scenario.id, scenario.id)
  assert.strictEqual(restored.scenario.turnsCount, scenario.turnsCount)
  assert.deepStrictEqual(
    [...restored.scenario.wordsUsed].sort(),
    [...scenario.wordsUsed].sort(),
  )
  assert.deepStrictEqual(restored.scenario.targetWords, scenario.targetWords)
  assert.strictEqual(restored.scenario.name, scenario.name)

  console.log('✅ scenario DB restore test passed')
}

main()
  .catch((err) => {
    console.error('❌ scenario DB restore test failed:', err)
    process.exitCode = 1
  })
  .finally(() => {
    closeDb()
    rmSync(tmpDir, { recursive: true, force: true })
  })
