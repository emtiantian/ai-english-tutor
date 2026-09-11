import type { FastifyInstance } from 'fastify'
import { getDb } from '../db/index.js'
import { allMigrations } from '../db/migrations/index.js'
import { config } from '../config.js'
import { statfs } from 'node:fs/promises'

interface HealthCheckResult {
  ok: boolean
  [key: string]: unknown
}

interface HealthResponse {
  status: 'ok' | 'degraded'
  timestamp: string
  checks: {
    database: HealthCheckResult
    migrations: HealthCheckResult & { current?: number; latest?: number }
    llm: HealthCheckResult & { provider?: string }
    tts: HealthCheckResult & { provider?: string }
    asr: HealthCheckResult & { provider?: string }
    disk: HealthCheckResult & { freePercent?: number }
  }
}

/**
 * 健康检查端点
 * GET /api/health
 *
 * 返回结构化 checks，供部署脚本做端到端验证。
 * 仍保持 HTTP 200，避免 Docker healthcheck 在启动阶段因瞬时降级而失败；
 * 整体状态通过 status 字段（ok/degraded）表达。
 */
export async function healthRoutes(server: FastifyInstance): Promise<void> {
  server.get('/api/health', async () => {
    const checks: HealthResponse['checks'] = {
      database: { ok: false },
      migrations: { ok: false },
      llm: { ok: false, provider: config.LLM_PROVIDER },
      tts: { ok: false, provider: config.TTS_PROVIDER },
      asr: { ok: false, provider: config.ASR_PROVIDER },
      disk: { ok: false }
    }

    // ── 数据库检查 ──
    try {
      const db = getDb()
      db.prepare('SELECT 1').get()
      checks.database = { ok: true }

      // ── 迁移版本检查 ──
      const currentResult = db.prepare('SELECT MAX(version) as version FROM __migrations').get() as
        { version: number | null } | undefined
      const current = currentResult?.version ?? 0
      const latest = allMigrations[allMigrations.length - 1]?.version ?? 0
      checks.migrations = {
        ok: current >= latest,
        current,
        latest
      }
    } catch (err) {
      checks.database = { ok: false, error: err instanceof Error ? err.message : String(err) }
      checks.migrations = { ok: false, error: err instanceof Error ? err.message : String(err) }
    }

    // ── LLM 配置就绪检查 ──
    checks.llm = { ok: checkLlmReady(), provider: config.LLM_PROVIDER }

    // ── TTS 配置/服务就绪检查 ──
    checks.tts = await checkTtsReady()

    // ── ASR 配置就绪检查 ──
    checks.asr = checkAsrReady()

    // ── 磁盘空间检查 ──
    checks.disk = await checkDiskSpace()

    const allOk = Object.values(checks).every(c => c.ok)
    const response: HealthResponse = {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks
    }

    return response
  })
}

function checkLlmReady(): boolean {
  return (
    config.LLM_PROVIDER === 'mock' ||
    (config.LLM_PROVIDER === 'deepseek' && config.DEEPSEEK_API_KEY !== '')
  )
}

function checkTtsReady(): HealthCheckResult & { provider?: string } {
  switch (config.TTS_PROVIDER) {
    case 'browser':
      return { ok: true, provider: config.TTS_PROVIDER }
    case 'xiaomi':
      return {
        ok: config.XIAOMI_TTS_API_KEY !== '',
        provider: config.TTS_PROVIDER
      }
    default:
      return { ok: false, provider: config.TTS_PROVIDER }
  }
}

function checkAsrReady(): HealthCheckResult & { provider?: string } {
  return { ok: config.ASR_PROVIDER === 'browser', provider: config.ASR_PROVIDER }
}

async function checkDiskSpace(): Promise<HealthCheckResult & { freePercent?: number }> {
  try {
    const stats = await statfs(config.DATA_DIR)
    const total = stats.blocks * stats.bsize
    const free = stats.bfree * stats.bsize
    const freePercent = total > 0 ? Math.round((free / total) * 100) : 0
    return {
      ok: freePercent >= 5,
      freePercent
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}
