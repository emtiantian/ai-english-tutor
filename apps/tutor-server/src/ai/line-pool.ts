import { promises as fs } from 'fs'
import { createHash } from 'crypto'
import { resolve, join } from 'path'
import { logger } from '../logger.js'
import { config } from '../config.js'

/**
 * 可复用台词池 — TTS 缓存复用背后的纯文本记忆。
 *
 * TTS 缓存键是 (text + voiceDesign) 的哈希，因此缓存本身无法告诉我们之前说了什么。
 * 该池按（场景、CEFR 等级、音色）分组，存储 Luna 实际说过的逐字英文台词，以便把它们回传到
 * LLM prompt，并要求其在合适时逐字复用某句台词 — 这样就能保证 TTS 缓存命中（零合成成本）。
 *
 * 无需预置：池完全从真实对话中成长，因此场景玩得越多，复用率 — 以及节省的成本 — 就越高。
 *
 * 存储方式与 tts-cache.ts / voice-samples.ts 类似：每个分组一个 JSON 文件，位于
 * ${DATA_DIR}/line-pool/ 下，并采用分组锁以保证并发写入安全。
 */

const POOL_DIR = resolve(config.LINE_POOL_DIR)
const MAX_LINES = config.LINE_POOL_MAX_LINES

interface PoolLine {
  /** 按合成时的逐字文本 — 必须完全匹配才能命中 TTS 缓存。 */
  text: string
  /** 该台词被记录的次数（用于淘汰排序）。 */
  count: number
}

interface PoolFile {
  lines: PoolLine[]
}

/** 分组文件操作锁（分组哈希 → 进行中的 promise）。 */
const fileLocks = new Map<string, Promise<void>>()

async function ensureDir(): Promise<void> {
  await fs.mkdir(POOL_DIR, { recursive: true })
}

/**
 * 构建稳定的分组键。音色被包含在内，因为 TTS 缓存键包含 voiceDesign —
 * 只有在相同音色下复用台词才能命中缓存。
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
    // 缺失或损坏 → 空池
  }
  return { lines: [] }
}

async function savePool(group: string, pool: PoolFile): Promise<void> {
  const path = groupPath(group)
  const tempPath = `${path}.tmp.${Date.now()}`
  await fs.writeFile(tempPath, JSON.stringify(pool))
  await fs.rename(tempPath, path)
}

/** 仅用于去重归一化 — 存储/返回的文本保持逐字原样。 */
function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * 记录 Luna 实际说过的一句台词。按归一化文本去重（增加计数），
 * 并在超过容量时淘汰计数最低的台词。
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

    // 超过容量时淘汰使用频率最低的台词。
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
 * 返回某分组中使用最多的台词，按计数从高到低，用于注入 prompt。
 * 读取无锁（写入是原子重命名）。
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
