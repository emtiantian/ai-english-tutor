import assert from 'node:assert'
import http from 'node:http'
import type { FastifyInstance } from 'fastify'
import Fastify from 'fastify'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerSSE } from '../sse/handler.js'
import { initSchema } from '../db/index.js'
import { loadAllScenarios } from '../vocab/loader.js'

const tmpDir = mkdtempSync(join(tmpdir(), 'tutor-engine-test-'))
process.env.DB_PATH = join(tmpDir, 'test.db')
process.env.LLM_PROVIDER = 'mock'
process.env.TTS_PROVIDER = 'browser'
process.env.ASR_PROVIDER = 'browser'

const { config } = await import('../config.js')
;(config as any).LLM_PROVIDER = 'mock'
;(config as any).TTS_PROVIDER = 'browser'
;(config as any).ASR_PROVIDER = 'browser'

const { TutorEngine } = await import('./engine.js')

function createSSEServer(): Promise<{ server: FastifyInstance; port: number }> {
  return new Promise((resolve, reject) => {
    const server = Fastify({ logger: false })
    registerSSE(server)
      .then(() => server.listen({ port: 0 }))
      .then(() => {
        const address = server.server.address()
        const port =
          typeof address === 'string' ? parseInt(address.split(':').pop()!, 10) : address!.port
        resolve({ server, port })
      })
      .catch(reject)
  })
}

function collectSSE(url: string): Promise<{ events: Array<{ event?: string; data: unknown }>; req: http.ClientRequest }> {
  return new Promise((resolve, reject) => {
    const events: Array<{ event?: string; data: unknown }> = []
    const req = http.get(url, (res) => {
      let buffer = ''
      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8')
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''
        for (const part of parts) {
          const lines = part.split('\n')
          let event: string | undefined
          let data = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) event = line.slice(7)
            else if (line.startsWith('data: ')) data = line.slice(6)
          }
          if (data) {
            try {
              events.push({ event, data: JSON.parse(data) })
            } catch {
              events.push({ event, data })
            }
          }
        }
      })
      const timeout = setTimeout(() => resolve({ events, req }), 3000)
      res.on('end', () => {
        clearTimeout(timeout)
        resolve({ events, req })
      })
    })
    req.on('error', reject)
  })
}

async function main(): Promise<void> {
  initSchema()
  loadAllScenarios()

  const engine = new TutorEngine()
  const userId = 'engine-test-user'

  // ── Non-streaming response ────────────────────────────────

  const nonStream = await engine.handleUserSpeak('Hello', {
    level: 2,
    stream: false,
    userId,
  })
  assert(nonStream.text.length > 0, 'non-stream response should have text')
  assert(nonStream.motionId, 'non-stream response should have motionId')
  assert(nonStream.expressionId, 'non-stream response should have expressionId')

  // ── Streaming response ────────────────────────────────────

  const { server, port } = await createSSEServer()
  const sessionId = 'stream-test-session'
  const collector = await collectSSE(`http://localhost:${port}/api/chat/stream?sessionId=${sessionId}`)

  const streamResult = await engine.handleUserSpeak('How are you?', {
    sessionId,
    level: 2,
    stream: true,
    userId,
  })
  assert(streamResult.text.length > 0, 'stream response should have text')

  // Wait a tick for all chunks to be broadcast
  await new Promise((resolve) => setTimeout(resolve, 500))

  const chunkEvents = collector.events.filter((e) => e.event === 'teacher.chunk')
  assert(chunkEvents.length > 0, 'streaming should broadcast teacher.chunk events')
  const lastChunk = chunkEvents[chunkEvents.length - 1].data as { chunk: string; isEnd: boolean }
  assert.strictEqual(lastChunk.isEnd, true, 'last chunk should have isEnd: true')

  collector.req.destroy()
  await server.close()

  // ── Session persistence ───────────────────────────────────

  const sessionA = 'persist-session'
  await engine.handleUserSpeak('First message', { sessionId: sessionA, level: 2, stream: false, userId })
  const info1 = engine.getSession(sessionA)
  assert.strictEqual(info1?.historyCount, 2, 'session should have user + assistant messages')

  await engine.handleUserSpeak('Second message', { sessionId: sessionA, level: 2, stream: false, userId })
  const info2 = engine.getSession(sessionA)
  assert.strictEqual(info2?.historyCount, 4, 'session history should accumulate')

  // ── AbortSignal propagation ───────────────────────────────

  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    engine.handleUserSpeak('Ignore me', { level: 2, stream: false, signal: controller.signal }),
    /AbortError/,
  )

  // ── Scenario progress ─────────────────────────────────────

  const scenarioSession = 'scenario-session'
  const scenarioStart = await engine.startLesson(1, scenarioSession, userId, 'restaurant-ordering')
  assert(scenarioStart.scenario, 'scenario lesson should return scenario state')
  assert.strictEqual(scenarioStart.scenario?.targetWords.length, 30, 'v2 picks 30 target words by CEFR level + topics')
  assert.strictEqual(scenarioStart.scenario?.maxTurns, 20, 'default max turns is 20')

  const scenarioTurn = await engine.handleUserSpeak('I would like a coffee please', {
    sessionId: scenarioSession,
    level: 1,
    stream: false,
    userId,
  })
  assert(scenarioTurn.scenario, 'scenario should persist across turns')
  assert(
    scenarioTurn.scenario!.wordsLearned.length > 0,
    'using a target word should mark it as learned',
  )
  assert.strictEqual(scenarioTurn.scenario!.turnsCount, 1, 'turn count increments')
  assert.ok(typeof scenarioTurn.scenario!.coverageRate === 'number', 'coverage rate is returned')

  console.log('✅ engine test passed')
}

main()
  .catch((err) => {
    console.error('❌ engine test failed:', err)
    process.exitCode = 1
  })
  .finally(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })
