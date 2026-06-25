import { promises as fs } from 'fs'
import { createHash } from 'crypto'
import { resolve, join } from 'path'
import { logger } from '../logger.js'
import { config } from '../config.js'

/**
 * Reusable-line pool — the plaintext memory behind TTS cache reuse.
 *
 * The TTS cache key is a hash of (text + voiceDesign), so the cache itself
 * cannot tell us *what* was said before. This pool stores the verbatim English
 * lines Luna has actually spoken, grouped by (scenario, CEFR level, voice), so
 * we can feed them back into the LLM prompt and ask it to reuse a line VERBATIM
 * when one fits — which then guarantees a TTS cache hit (zero synthesis cost).
 *
 * Nothing is pre-seeded: the pool grows purely from real conversations, so
 * reuse — and savings — increase the more a scenario is played.
 *
 * Storage mirrors tts-cache.ts / voice-samples.ts: one JSON file per group
 * under ${DATA_DIR}/line-pool/, with per-group locking for safe concurrent writes.
 */

const POOL_DIR = resolve(config.LINE_POOL_DIR)
const MAX_LINES = config.LINE_POOL_MAX_LINES

interface PoolLine {
  /** Verbatim text as synthesized — must match exactly to hit the TTS cache. */
  text: string
  /** How many times this line has been recorded (used for eviction ranking). */
  count: number
}

interface PoolFile {
  lines: PoolLine[]
}

/** Per-group file operation locks (group hash → in-flight promise). */
const fileLocks = new Map<string, Promise<void>>()

async function ensureDir(): Promise<void> {
  await fs.mkdir(POOL_DIR, { recursive: true })
}

/**
 * Build a stable group key. Voice is included because the TTS cache key
 * includes voiceDesign — reusing a line only hits the cache for the same voice.
 */
export function lineGroupKey(scenarioId: string, level: string, voiceDesign?: string): string {
  const voiceHash = createHash('sha256').update(voiceDesign ?? '').digest('hex').slice(0, 8)
  return `${scenarioId}:${level}:${voiceHash}`
}

function groupPath(group: string): string {
  const hash = createHash('sha256').update(group).digest('hex')
  return join(POOL_DIR, `${hash}.json`)
}

async function acquireLock(group: string): Promise<() => void> {
  while (fileLocks.has(group)) {
    // eslint-disable-next-line no-await-in-loop
    await fileLocks.get(group)
  }
  let release: () => void
  const lockPromise = new Promise<void>((res) => {
    release = () => {
      fileLocks.delete(group)
      res()
    }
  })
  fileLocks.set(group, lockPromise)
  return release!
}

async function loadPool(group: string): Promise<PoolFile> {
  try {
    const raw = await fs.readFile(groupPath(group), 'utf-8')
    const parsed = JSON.parse(raw) as PoolFile
    if (Array.isArray(parsed.lines)) return parsed
  } catch {
    // missing or corrupt → empty pool
  }
  return { lines: [] }
}

async function savePool(group: string, pool: PoolFile): Promise<void> {
  const path = groupPath(group)
  const tempPath = `${path}.tmp.${Date.now()}`
  await fs.writeFile(tempPath, JSON.stringify(pool))
  await fs.rename(tempPath, path)
}

/** Normalize for dedup only — the stored/returned text stays verbatim. */
function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Record a line Luna actually spoke. Deduplicates on normalized text
 * (incrementing its count) and evicts the lowest-count line when over capacity.
 */
export async function recordTeacherLine(group: string, text: string): Promise<void> {
  const trimmed = text?.trim()
  if (!trimmed) return

  await ensureDir()
  const release = await acquireLock(group)
  try {
    const pool = await loadPool(group)
    const norm = normalize(trimmed)
    const existing = pool.lines.find((l) => normalize(l.text) === norm)
    if (existing) {
      existing.count++
    } else {
      pool.lines.push({ text: trimmed, count: 1 })
    }

    // Evict lowest-frequency lines when over capacity.
    if (pool.lines.length > MAX_LINES) {
      pool.lines.sort((a, b) => b.count - a.count)
      pool.lines.length = MAX_LINES
    }

    await savePool(group, pool)
    logger.debug({ group, size: pool.lines.length }, 'Line pool recorded')
  } catch (err) {
    logger.warn({ err, group }, 'Line pool record failed (non-fatal)')
  } finally {
    release()
  }
}

/**
 * Return the most-used lines for a group, highest count first, for prompt
 * injection. Reading is lock-free (writes are atomic renames).
 */
export async function getReusableLines(group: string, limit = config.LINE_POOL_INJECT_LIMIT): Promise<string[]> {
  try {
    const pool = await loadPool(group)
    return pool.lines
      .slice()
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map((l) => l.text)
  } catch (err) {
    logger.warn({ err, group }, 'Line pool read failed (non-fatal)')
    return []
  }
}
