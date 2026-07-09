import { promises as fs } from 'fs'
import { createHash } from 'crypto'
import { resolve, join } from 'path'
import { logger } from '../logger.js'
import { config } from '../config.js'

/** 音色参考样本存储目录：${DATA_DIR}/voice-samples/ */
const SAMPLES_DIR = join(config.DATA_DIR, 'voice-samples')

/** 确保样本目录存在 */
async function ensureDir(): Promise<void> {
  await fs.mkdir(SAMPLES_DIR, { recursive: true })
}

/** 计算 voiceDesign 的 SHA256 哈希（样本文件名） */
function hashVoiceDesign(voiceDesign: string): string {
  return createHash('sha256').update(voiceDesign).digest('hex')
}

/** 获取样本文件路径 */
function samplePath(hash: string): string {
  return resolve(SAMPLES_DIR, `${hash}.wav`)
}

/**
 * 检查某 voiceDesign 是否已有参考样本
 */
export async function hasVoiceSample(voiceDesign: string): Promise<boolean> {
  await ensureDir()
  const hash = hashVoiceDesign(voiceDesign)
  try {
    await fs.access(samplePath(hash))
    return true
  } catch {
    return false
  }
}

/**
 * 保存参考样本
 */
export async function saveVoiceSample(voiceDesign: string, audio: Buffer): Promise<void> {
  await ensureDir()
  const hash = hashVoiceDesign(voiceDesign)
  const path = samplePath(hash)
  await fs.writeFile(path, audio)
  logger.info(
    { hash: hash.slice(0, 12), size: audio.length, path },
    '[音色样本] 参考样本已保存',
  )
}

/**
 * 读取参考样本
 */
export async function loadVoiceSample(voiceDesign: string): Promise<Buffer> {
  await ensureDir()
  const hash = hashVoiceDesign(voiceDesign)
  const path = samplePath(hash)
  const buffer = await fs.readFile(path)
  logger.debug(
    { hash: hash.slice(0, 12), size: buffer.length },
    '[音色样本] 已从磁盘加载参考样本',
  )
  return buffer
}

/**
 * 获取或生成参考样本（base64）
 *
 * 如果已有样本 → 读取返回 base64
 * 如果没有 → 调用 generator 生成 → 保存 → 返回 base64
 */
export async function getOrGenerateVoiceSample(
  voiceDesign: string,
  generator: () => Promise<Buffer>,
): Promise<string> {
  const hash = hashVoiceDesign(voiceDesign)

  if (await hasVoiceSample(voiceDesign)) {
    const buffer = await loadVoiceSample(voiceDesign)
    return buffer.toString('base64')
  }

  logger.info(
    { hash: hash.slice(0, 12) },
    '[音色样本] 未找到参考样本，通过 voicedesign 标定...',
  )
  const audio = await generator()
  await saveVoiceSample(voiceDesign, audio)
  return audio.toString('base64')
}
