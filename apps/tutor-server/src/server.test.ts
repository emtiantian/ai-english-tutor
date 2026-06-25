import assert from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmpDir = mkdtempSync(join(tmpdir(), 'tutor-cors-test-'))
process.env.DB_PATH = join(tmpDir, 'test.db')
process.env.CORS_ORIGIN = '*'

const { createServer } = await import('./server.js')

async function main(): Promise<void> {
  const server = await createServer()

  // Wildcard mode: any origin should be allowed, but credentials must NOT be enabled.
  const wildcardRes = await server.inject({
    method: 'GET',
    url: '/health',
    headers: { origin: 'http://evil.example.com' },
  })
  assert(
    wildcardRes.headers['access-control-allow-origin'],
    'wildcard mode should set Access-Control-Allow-Origin',
  )
  assert.notStrictEqual(
    wildcardRes.headers['access-control-allow-credentials'],
    'true',
    'wildcard mode must not send Access-Control-Allow-Credentials: true',
  )

  await server.close()

  // Explicit whitelist mode: reflect the origin and allow credentials.
  const { config: serverConfig } = await import('./config.js')
  serverConfig.CORS_ORIGIN.length = 0
  serverConfig.CORS_ORIGIN.push('http://localhost:5173', 'http://localhost:4173')
  const whitelistedServer = await createServer()
  const allowedRes = await whitelistedServer.inject({
    method: 'GET',
    url: '/health',
    headers: { origin: 'http://localhost:5173' },
  })
  assert.strictEqual(
    allowedRes.headers['access-control-allow-origin'],
    'http://localhost:5173',
    'whitelisted origin should be reflected',
  )
  assert.strictEqual(
    allowedRes.headers['access-control-allow-credentials'],
    'true',
    'whitelist mode should allow credentials',
  )

  const blockedRes = await whitelistedServer.inject({
    method: 'GET',
    url: '/health',
    headers: { origin: 'http://evil.example.com' },
  })
  assert.notStrictEqual(
    blockedRes.headers['access-control-allow-origin'],
    'http://evil.example.com',
    'non-whitelisted origin should not be reflected',
  )

  await whitelistedServer.close()
  console.log('✅ CORS wildcard/credentials test passed')
}

main()
  .catch((err) => {
    console.error('❌ CORS wildcard/credentials test failed:', err)
    process.exitCode = 1
  })
  .finally(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })
