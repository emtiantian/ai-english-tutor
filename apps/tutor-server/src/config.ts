import { config as loadEnv } from 'dotenv'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const IS_DEPLOY = process.env.NODE_ENV === 'production'

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(serverRoot, '..', '..')
const deployDataDir = join(homedir(), '.ai-english-tutor', 'data')
const defaultDataDir = IS_DEPLOY ? deployDataDir : join(repoRoot, '.dev-data')
const envPaths = IS_DEPLOY
  ? [
      join(process.env.DATA_DIR ?? deployDataDir, '.env'),
      join(homedir(), '.ai-english-tutor', '.env')
    ]
  : [join(repoRoot, '.env')]

for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, quiet: true })
    break
  }
}

const dataDir = process.env.DATA_DIR ?? defaultDataDir

export const config = {
  PORT: Number.parseInt(process.env.PORT ?? '3000', 10),
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
  CORS_ORIGIN: (process.env.CORS_ORIGIN ?? '*')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean),
  SSE_HEARTBEAT_INTERVAL: Number.parseInt(process.env.SSE_HEARTBEAT_INTERVAL ?? '30000', 10),

  LLM_PROVIDER: process.env.LLM_PROVIDER ?? 'mock',
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ?? '',
  DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',

  TTS_PROVIDER: process.env.TTS_PROVIDER ?? 'browser',
  TTS_FORMAT: process.env.TTS_FORMAT ?? 'mp3',
  TTS_SPEED: Number.parseFloat(process.env.TTS_SPEED ?? '1'),
  XIAOMI_TTS_API_KEY: process.env.XIAOMI_TTS_API_KEY ?? '',
  XIAOMI_TTS_BASE_URL: process.env.XIAOMI_TTS_BASE_URL ?? 'https://api.xiaomimimo.com/v1',
  XIAOMI_TTS_MODE: process.env.XIAOMI_TTS_MODE ?? 'preset',
  XIAOMI_TTS_VOICE: process.env.XIAOMI_TTS_VOICE ?? 'Mia',
  XIAOMI_TTS_VOICE_DESIGN: process.env.XIAOMI_TTS_VOICE_DESIGN ?? '',

  ASR_PROVIDER: process.env.ASR_PROVIDER ?? 'browser',
  ASR_LANGUAGE: process.env.ASR_LANGUAGE ?? 'en-US',

  DATA_DIR: dataDir,
  CONFIG_DIR: process.env.CONFIG_DIR ?? dataDir
} as const

export function getTtsSource(): 'local' | 'remote' {
  return config.TTS_PROVIDER === 'browser' ? 'local' : 'remote'
}
