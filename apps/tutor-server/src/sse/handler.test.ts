import assert from 'node:assert'
import { config } from '../config.js'
import { resolveCorsOrigin } from './handler.js'

async function main(): Promise<void> {
  const originalOrigins = [...config.CORS_ORIGIN]

  try {
    // 通配符模式：回显请求来源，否则回退到 '*'。
    config.CORS_ORIGIN.length = 0
    config.CORS_ORIGIN.push('*')
    assert.strictEqual(resolveCorsOrigin('http://evil.example.com'), 'http://evil.example.com')
    assert.strictEqual(resolveCorsOrigin(undefined), '*')

    // 白名单模式：回显允许的来源。
    config.CORS_ORIGIN.length = 0
    config.CORS_ORIGIN.push('http://localhost:5173', 'http://localhost:4173')
    assert.strictEqual(resolveCorsOrigin('http://localhost:5173'), 'http://localhost:5173')
    assert.strictEqual(resolveCorsOrigin('http://localhost:4173'), 'http://localhost:4173')

    // 没有请求来源时：默认使用第一个配置的源。
    assert.strictEqual(resolveCorsOrigin(undefined), 'http://localhost:5173')

    // 被阻止的来源：必须返回布尔值 false，而不是字符串 'false'。
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
