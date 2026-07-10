import { promises as fs } from 'fs'
import { createHash } from 'crypto'
import { resolve } from 'path'
import { logger } from '../logger.js'
import { config } from '../config.js'

const CACHE_DIR = resolve(config.TTS_CACHE_DIR)
const MAX_CACHE_SIZE_MB = config.TTS_CACHE_MAX_MB  // 缓存总大小上限
const MAX_CACHE_FILES = config.TTS_CACHE_MAX_FILES  // 缓存文件数量上限

/** 按缓存键索引的合成中 Promise */
const inFlight = new Map<string, Promise<Buffer>>()

/**
 * 自进程启动以来的累计缓存统计。
 *
 * `hits` = 从磁盘直接返回（未调用 TTS API）；`misses` = 需要重新合成。
 * 用于衡量缓存实际节省了多少 TTS 开销。
 */
const stats = { hits: 0, misses: 0 }

/** 每 N 次合成请求（命中 + 未命中）记录一次统计摘要。 */
const STATS_LOG_EVERY = 20

/** 每多少次写入触发一次缓存清理 */
const CLEANUP_EVERY_WRITES = 50

/** 累计写入次数，用于触发周期性清理 */
let writeCount = 0

/** 上次清理时观测到的文件数，用于判断是否接近上限需要提前清理 */
let lastKnownFileCount = 0

/**
 * 影响音频输出的缓存键维度。
 * 所有维度都会参与缓存键的计算，确保同文本但不同音色/格式/语速
 * 不会命中错误缓存。
 */
export interface CacheKeyOptions {
  /** 音色 ID */
  voice?: string
  /** 音频格式：mp3 | wav | pcm ... */
  format?: string
  /** 语速倍数 */
  speed?: number
  /** 音色设计描述（小米 VoiceDesign 等） */
  voiceDesign?: string
  /** TTS 模式（小米 preset / voicedesign / voiceclone） */
  mode?: string
}

/**
 * 缓存效果快照。`hitRate` = 命中数 /（命中数 + 未命中数）。
 * 通过 GET /api/tts/stats 暴露，供实时观察。
 */
export function getCacheStats(): {
  hits: number
  misses: number
  total: number
  hitRate: number
} {
  const total = stats.hits + stats.misses
  return {
    hits: stats.hits,
    misses: stats.misses,
    total,
    hitRate: total === 0 ? 0 : stats.hits / total,
  }
}

function recordHit(): void {
  stats.hits++
  maybeLogStats()
}

function recordMiss(): void {
  stats.misses++
  maybeLogStats()
}

/**
 * 磁盘缓存占用以及配置的淘汰上限。
 * 需要读取缓存目录，因此是异步的；用于统计接口。
 */
export async function getCacheDiskUsage(): Promise<{
  dir: string
  files: number
  sizeMB: number
  maxFiles: number
  maxMB: number
}> {
  let files = 0
  let totalBytes = 0
  try {
    const entries = await fs.readdir(CACHE_DIR, { withFileTypes: true })
    const wavs = entries.filter(
      (e) => e.isFile() && e.name.endsWith('.wav') && !e.name.includes('.tmp.'),
    )
    const sizes = await Promise.all(
      wavs.map(async (e) => (await fs.stat(resolve(CACHE_DIR, e.name))).size),
    )
    files = wavs.length
    totalBytes = sizes.reduce((sum, s) => sum + s, 0)
  } catch {
    // 目录尚未创建 -> 返回零值
  }
  return {
    dir: CACHE_DIR,
    files,
    sizeMB: Number((totalBytes / 1024 / 1024).toFixed(2)),
    maxFiles: MAX_CACHE_FILES,
    maxMB: MAX_CACHE_SIZE_MB,
  }
}

function maybeLogStats(): void {
  const total = stats.hits + stats.misses
  if (total % STATS_LOG_EVERY !== 0) return
  logger.info(
    {
      hits: stats.hits,
      misses: stats.misses,
      total,
      hitRate: Number((stats.hits / total).toFixed(3)),
    },
    'TTS 缓存统计',
  )
}

async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true })
}

/**
 * 构建缓存键：把所有影响音频输出的维度一起 SHA256，
 * 避免同文本不同音色/格式/语速命中错误缓存。
 */
export function buildCacheKey(text: string, opts: CacheKeyOptions = {}): string {
  const parts = [
    text,
    opts.voice ?? '',
    opts.format ?? '',
    opts.speed !== undefined ? String(opts.speed) : '',
    opts.voiceDesign ?? '',
    opts.mode ?? '',
  ]
  return createHash('sha256').update(parts.join('|')).digest('hex')
}

function getCachePath(key: string): string {
  return resolve(CACHE_DIR, `${key}.wav`)
}

/**
 * 读取指定文本对应的缓存音频。
 *
 * setCachedAudio 已用 tmp+rename 原子写，读取 final path 永远
 * 拿不到半个文件，inFlight 已做并发去重，无需额外文件锁。
 */
export async function getCachedAudio(text: string, opts: CacheKeyOptions = {}): Promise<Buffer | undefined> {
  await ensureCacheDir()
  const key = buildCacheKey(text, opts)
  const path = getCachePath(key)

  try {
    const buffer = await fs.readFile(path)
    logger.debug({ key: key.slice(0, 8) }, 'TTS 缓存命中')
    return buffer
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return undefined
    logger.warn({ key: key.slice(0, 8), err }, 'TTS 缓存读取失败')
    throw err
  }
}

/**
 * 以原子方式将音频保存到缓存。
 *
 * 先写入临时文件，再重命名为目标文件，确保读取端永远不会
 * 看到部分写入的文件。写入后按计数触发周期性清理。
 */
export async function setCachedAudio(text: string, buffer: Buffer, opts: CacheKeyOptions = {}): Promise<void> {
  await ensureCacheDir()
  const key = buildCacheKey(text, opts)
  const path = getCachePath(key)
  const tempPath = `${path}.tmp.${Date.now()}`
  await fs.writeFile(tempPath, buffer)
  await fs.rename(tempPath, path)
  logger.debug({ key: key.slice(0, 8), size: buffer.length }, 'TTS 缓存已保存')

  writeCount++
  // 每达 50 次写入、或上次观测到的文件数已达上限 80% 时才清理，避免每次写入都扫盘
  if (writeCount % CLEANUP_EVERY_WRITES === 0 || lastKnownFileCount >= MAX_CACHE_FILES * 0.8) {
    await cleanupIfNeeded()
  }
}

/**
 * 高层辅助函数：返回缓存音频，或只合成一次并缓存。
 *
 * 对相同文本的并发请求去重，即使多个客户端同时请求同一句，
 * 也只会发起一次合成调用。
 */
export async function getOrSynthesizeCachedAudio(
  text: string,
  opts: CacheKeyOptions,
  synthesize: () => Promise<Buffer>,
): Promise<Buffer> {
  await ensureCacheDir()
  const key = buildCacheKey(text, opts)

  const existing = inFlight.get(key)
  if (existing) {
    logger.debug({ key: key.slice(0, 8) }, 'TTS 合成已在进行中，加入等待')
    return existing
  }

  const promise = (async () => {
    const cached = await getCachedAudio(text, opts)
    if (cached) {
      recordHit()
      return cached
    }

    recordMiss()
    const buffer = await synthesize()
    await setCachedAudio(text, buffer, opts)
    return buffer
  })().finally(() => {
    inFlight.delete(key)
  })

  inFlight.set(key, promise)
  return promise
}

// LRU 清理：当缓存超出限制时，删除最旧的文件
async function cleanupIfNeeded(): Promise<void> {
  const entries = await fs.readdir(CACHE_DIR, { withFileTypes: true })

  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.wav') && !entry.name.includes('.tmp.'))
      .map(async (entry) => {
        const path = resolve(CACHE_DIR, entry.name)
        const stat = await fs.stat(path)
        return { path, mtime: stat.mtimeMs, size: stat.size }
      }),
  )

  files.sort((a, b) => a.mtime - b.mtime)  // 最旧的排在前面

  let totalSize = files.reduce((sum, f) => sum + f.size, 0)
  const maxSize = MAX_CACHE_SIZE_MB * 1024 * 1024

  while ((files.length > MAX_CACHE_FILES || totalSize > maxSize) && files.length > 0) {
    const oldest = files.shift()!
    try {
      await fs.unlink(oldest.path)
      totalSize -= oldest.size
      logger.debug({ file: oldest.path }, 'TTS 缓存已淘汰')
    } catch {
      // 忽略
    }
  }

  // 更新观测值，供 setCachedAudio 判断是否需要提前清理
  lastKnownFileCount = files.length
}
