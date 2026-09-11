import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestEnv } from '@tests/helpers/env.js'
import { createSSEServer, collectSSE } from '@tests/helpers/sse.js'

describe('TutorEngine', () => {
  const env = createTestEnv('engine')

  beforeAll(() => {
    env.setup()
  })

  afterAll(() => {
    env.cleanup()
  })

  it('handles non-stream user speak', async () => {
    const { initSchema } = await import('@/db/index.js')
    const { loadAllScenarios } = await import('@/vocab/loader.js')
    const { TutorEngine } = await import('@/ai/engine.js')

    initSchema()
    loadAllScenarios()

    const engine = new TutorEngine()
    const userId = 'engine-test-user'

    const nonStream = await engine.handleUserSpeak('Hello', {
      level: 2,
      stream: false,
      userId
    })

    expect(nonStream.text.length).toBeGreaterThan(0)
    expect(nonStream.motionId).toBeDefined()
    expect(nonStream.expressionId).toBeDefined()
  })

  it('handles stream user speak and broadcasts chunks', async () => {
    const { initSchema } = await import('@/db/index.js')
    const { loadAllScenarios } = await import('@/vocab/loader.js')
    const { TutorEngine } = await import('@/ai/engine.js')

    initSchema()
    loadAllScenarios()

    const engine = new TutorEngine()
    const userId = 'engine-test-user'

    const { server, port } = await createSSEServer()
    const sessionId = 'stream-test-session'
    const collector = await collectSSE(
      `http://localhost:${port}/api/chat/stream?sessionId=${sessionId}`,
      { minEvents: 1 }
    )

    const streamResult = await engine.handleUserSpeak('How are you?', {
      sessionId,
      level: 2,
      stream: true,
      userId,
      requestId: 'engine-stream-request'
    })
    expect(streamResult.text.length).toBeGreaterThan(0)

    await new Promise(resolve => setTimeout(resolve, 500))

    const chunkEvents = collector.events.filter(e => e.event === 'teacher.chunk')
    expect(chunkEvents.length).toBeGreaterThan(0)
    const lastChunk = chunkEvents[chunkEvents.length - 1].data as {
      chunk: string
      isEnd: boolean
      requestId?: string
    }
    expect(lastChunk.isEnd).toBe(true)
    expect(lastChunk.requestId).toBe('engine-stream-request')

    collector.req.destroy()
    await server.close()
  })

  it('persists session history', async () => {
    const { initSchema } = await import('@/db/index.js')
    const { loadAllScenarios } = await import('@/vocab/loader.js')
    const { TutorEngine } = await import('@/ai/engine.js')

    initSchema()
    loadAllScenarios()

    const engine = new TutorEngine()
    const userId = 'engine-test-user'

    const sessionA = 'persist-session'
    await engine.handleUserSpeak('First message', {
      sessionId: sessionA,
      level: 2,
      stream: false,
      userId
    })
    const info1 = engine.getSession(sessionA)
    expect(info1?.historyCount).toBe(2)

    await engine.handleUserSpeak('Second message', {
      sessionId: sessionA,
      level: 2,
      stream: false,
      userId
    })
    const info2 = engine.getSession(sessionA)
    expect(info2?.historyCount).toBe(4)
  })

  it('propagates AbortSignal', async () => {
    const { initSchema } = await import('@/db/index.js')
    const { loadAllScenarios } = await import('@/vocab/loader.js')
    const { TutorEngine } = await import('@/ai/engine.js')

    initSchema()
    loadAllScenarios()

    const engine = new TutorEngine()
    const controller = new AbortController()
    controller.abort()

    await expect(
      engine.handleUserSpeak('Ignore me', { level: 2, stream: false, signal: controller.signal })
    ).rejects.toThrow(/AbortError/)
  })

  it('tracks scenario progress', async () => {
    const { initSchema } = await import('@/db/index.js')
    const { loadAllScenarios } = await import('@/vocab/loader.js')
    const { TutorEngine } = await import('@/ai/engine.js')

    initSchema()
    loadAllScenarios()

    const engine = new TutorEngine()
    const userId = 'engine-test-user'

    const scenarioSession = 'scenario-session'
    const scenarioStart = await engine.startLesson(
      1,
      scenarioSession,
      userId,
      'restaurant-ordering'
    )
    expect(scenarioStart.scenario).toBeDefined()
    expect(scenarioStart.scenario?.targetWords.length).toBe(30)
    expect(scenarioStart.scenario?.maxTurns).toBe(20)

    const scenarioTurn = await engine.handleUserSpeak('I would like a coffee please', {
      sessionId: scenarioSession,
      level: 1,
      stream: false,
      userId
    })
    expect(scenarioTurn.scenario).toBeDefined()
    expect(scenarioTurn.scenario!.wordsLearned.length).toBeGreaterThan(0)
    expect(scenarioTurn.scenario!.turnsCount).toBe(1)
    expect(typeof scenarioTurn.scenario!.coverageRate).toBe('number')
  })
})
