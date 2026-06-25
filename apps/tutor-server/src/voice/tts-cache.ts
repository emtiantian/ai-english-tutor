import { promises as fs } from 'fs'
import { createHash } from 'crypto'
import { resolve } from 'path'
import { logger } from '../logger.js'
import { config } from '../config.js'

const CACHE_DIR = resolve(config.TTS_CACHE_DIR)
const MAX_CACHE_SIZE_MB = config.TTS_CACHE_MAX_MB  // max total cache size
const MAX_CACHE_FILES = config.TTS_CACHE_MAX_FILES  // max number of cached files

/** In-flight synthesis promises keyed by cache key */
const inFlight = new Map<string, Promise<Buffer>>()

/** Per-key file operation locks */
const fileLocks = new Map<string, Promise<void>>()

/**
 * Cumulative cache stats since process start.
 *
 * `hits` = served from disk (no TTS API call); `misses` = had to synthesize.
 * Used to gauge how much TTS spend the cache is actually saving.
 */
const stats = { hits: 0, misses: 0 }

/** Log a stats summary every N synthesis requests (hit + miss). */
const STATS_LOG_EVERY = 20

/**
 * Snapshot of cache effectiveness. `hitRate` is hits / (hits + misses).
 * Exposed via GET /api/tts/stats for live observation.
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
 * On-disk cache footprint plus the configured eviction limits.
 * Reads the cache dir, so it's async; intended for the stats endpoint.
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
    // dir not created yet → zeros
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
    'TTS cache stats',
  )
}

async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true })
}

function getCacheKey(text: string, voiceDesign?: string): string {
  return createHash('sha256').update(text + (voiceDesign ?? '')).digest('hex')
}

function getCachePath(key: string): string {
  return resolve(CACHE_DIR, `${key}.wav`)
}

/**
 * Acquire an exclusive lock for operations on a given cache key.
 * Returns a release function that must be called when done.
 */
async function acquireLock(key: string): Promise<() => void> {
  while (fileLocks.has(key)) {
    // eslint-disable-next-line no-await-in-loop
    await fileLocks.get(key)
  }

  let release: () => void
  const lockPromise = new Promise<void>((resolve) => {
    release = () => {
      fileLocks.delete(key)
      resolve()
    }
  })
  fileLocks.set(key, lockPromise)
  return release!
}

/**
 * Read cached audio for the given text.
 *
 * Uses async I/O and per-key locking to avoid reading a half-written file.
 */
export async function getCachedAudio(text: string, voiceDesign?: string): Promise<Buffer | undefined> {
  await ensureCacheDir()
  const key = getCacheKey(text, voiceDesign)
  const path = getCachePath(key)

  const release = await acquireLock(key)
  try {
    const buffer = await fs.readFile(path)
    logger.debug({ key: key.slice(0, 8) }, 'TTS cache hit')
    return buffer
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return undefined
    logger.warn({ key: key.slice(0, 8), err }, 'TTS cache read failed')
    throw err
  } finally {
    release()
  }
}

/**
 * Save audio to cache atomically.
 *
 * Writes to a temp file first, then renames it into place so readers never
 * see a partially-written file.
 */
export async function setCachedAudio(text: string, buffer: Buffer, voiceDesign?: string): Promise<void> {
  await ensureCacheDir()
  const key = getCacheKey(text, voiceDesign)

  const release = await acquireLock(key)
  try {
    const path = getCachePath(key)
    const tempPath = `${path}.tmp.${Date.now()}`
    await fs.writeFile(tempPath, buffer)
    await fs.rename(tempPath, path)
    logger.debug({ key: key.slice(0, 8), size: buffer.length }, 'TTS cache saved')
    await cleanupIfNeeded()
  } finally {
    release()
  }
}

/**
 * High-level helper: return cached audio, or synthesize once and cache it.
 *
 * Deduplicates concurrent requests for the same text so only one synthesis
 * call is made even if many clients request the same phrase simultaneously.
 */
export async function getOrSynthesizeCachedAudio(
  text: string,
  voiceDesign: string | undefined,
  synthesize: () => Promise<Buffer>,
): Promise<Buffer> {
  await ensureCacheDir()
  const key = getCacheKey(text, voiceDesign)

  const existing = inFlight.get(key)
  if (existing) {
    logger.debug({ key: key.slice(0, 8) }, 'TTS synthesis already in flight, joining')
    return existing
  }

  const promise = (async () => {
    const cached = await getCachedAudio(text, voiceDesign)
    if (cached) {
      recordHit()
      return cached
    }

    recordMiss()
    const buffer = await synthesize()
    await setCachedAudio(text, buffer, voiceDesign)
    return buffer
  })().finally(() => {
    inFlight.delete(key)
  })

  inFlight.set(key, promise)
  return promise
}

// LRU cleanup: when cache exceeds limits, delete oldest files
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

  files.sort((a, b) => a.mtime - b.mtime)  // oldest first

  let totalSize = files.reduce((sum, f) => sum + f.size, 0)
  const maxSize = MAX_CACHE_SIZE_MB * 1024 * 1024

  while ((files.length > MAX_CACHE_FILES || totalSize > maxSize) && files.length > 0) {
    const oldest = files.shift()!
    try {
      await fs.unlink(oldest.path)
      totalSize -= oldest.size
      logger.debug({ file: oldest.path }, 'TTS cache evicted')
    } catch {
      // ignore
    }
  }
}
