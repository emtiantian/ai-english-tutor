import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestEnv } from '@tests/helpers/env.js'
import type { ScenarioState } from '@/ai/session-manager.js'

describe('SessionManager scenario state restore', () => {
  const env = createTestEnv('session-manager')

  beforeAll(() => {
    env.setup()
  })

  afterAll(() => {
    env.cleanup()
  })

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
          targetWords: ['coffee', 'tea', 'water']
        }
      ],
      turnsCount: 3,
      wordsUsed: new Set(['coffee', 'please'])
    }
  }

  it('saves and restores scenario state from DB', async () => {
    const { initSchema } = await import('@/db/index.js')
    const { SessionManager } = await import('@/ai/session-manager.js')

    initSchema()

    const manager = new SessionManager()
    const sessionId = 'test-scenario-session'
    const scenario = makeScenario()
    const session = {
      level: 2,
      history: [] as Array<{ role: 'user' | 'assistant'; content: string }>,
      vocabulary: new Set<string>(),
      voiceDesign: 'calm-friendly',
      scenario
    }

    manager.set(sessionId, session)
    manager.saveSessionToDb(sessionId, session.level, 'lazy-mature', session.voiceDesign)
    manager.saveScenarioState(sessionId, session.scenario)

    const restoredManager = new SessionManager()
    const restored = restoredManager.getOrCreate(sessionId, session.level)

    expect(restored.scenario).toBeDefined()
    expect(restored.scenario!.id).toBe(scenario.id)
    expect(restored.scenario!.turnsCount).toBe(scenario.turnsCount)
    expect([...restored.scenario!.wordsUsed].sort()).toEqual([...scenario.wordsUsed].sort())
    expect(restored.scenario!.targetWords).toEqual(scenario.targetWords)
    expect(restored.scenario!.name).toBe(scenario.name)
  })
})
