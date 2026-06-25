import assert from 'node:assert'
import { config } from '../config.js'
import { resolveCorsOrigin } from './handler.js'

async function main(): Promise<void> {
  const originalOrigins = [...config.CORS_ORIGIN]

  try {
    // Wildcard mode: reflect the request origin, or fall back to '*'.
    config.CORS_ORIGIN.length = 0
    config.CORS_ORIGIN.push('*')
    assert.strictEqual(resolveCorsOrigin('http://evil.example.com'), 'http://evil.example.com')
    assert.strictEqual(resolveCorsOrigin(undefined), '*')

    // Whitelist mode: reflect allowed origins.
    config.CORS_ORIGIN.length = 0
    config.CORS_ORIGIN.push('http://localhost:5173', 'http://localhost:4173')
    assert.strictEqual(resolveCorsOrigin('http://localhost:5173'), 'http://localhost:5173')
    assert.strictEqual(resolveCorsOrigin('http://localhost:4173'), 'http://localhost:4173')

    // No request origin: default to the first configured origin.
    assert.strictEqual(resolveCorsOrigin(undefined), 'http://localhost:5173')

    // Blocked origin: must return boolean false, NOT the string 'false'.
    const blocked = resolveCorsOrigin('http://evil.example.com')
    assert.strictEqual(blocked, false)
    assert.notStrictEqual(blocked, 'false')

    console.log('✅ SSE CORS origin resolution test passed')
  } finally {
    config.CORS_ORIGIN.length = 0
    config.CORS_ORIGIN.push(...originalOrigins)
  }
}

main()
  .catch((err) => {
    console.error('❌ SSE CORS origin resolution test failed:', err)
    process.exitCode = 1
  })
