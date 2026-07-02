/**
 * Configuration - loads environment variables with sensible defaults
 *
 * Automatically loads .env file if present (no external dependency needed).
 */
import { config as loadEnv } from 'dotenv'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { homedir } from 'os'
import { existsSync } from 'fs'

// ── Mode detection ──
// Deploy mode is triggered by NODE_ENV=production (set explicitly by docker-compose
// or the `start:deploy` package script). Anything else is treated as local dev.
//
// The two modes diverge on:
// 1. .env loading: deploy reads ~/.ai-english-tutor/data/.env (with ~/.ai-english-tutor/.env legacy fallback);
//    dev reads ONLY <repo>/.env — same file the frontend Vite reads (envDir points at repo root).
// 2. DATA_DIR default: deploy → ~/.ai-english-tutor/data; dev → <repo>/.dev-data (gitignored).
//
// This keeps ~/.ai-english-tutor/ purely a deployment artifact — local dev never reads
// or writes there.
export const IS_DEPLOY = process.env.NODE_ENV === 'production'

const __dirname = dirname(fileURLToPath(import.meta.url))
// In dev (`tsx src/index.ts`) __dirname is .../apps/tutor-server/src; in built mode
// (`node dist/index.js`) it is .../apps/tutor-server/dist. Either way ../ gives the
// server package root.
const SERVER_PKG_ROOT = resolve(__dirname, '..')
// <repo-root>: server pkg is at apps/tutor-server, so up two levels gets to repo root.
const REPO_ROOT = resolve(SERVER_PKG_ROOT, '..', '..')

// ── Resolve DATA_DIR default ──
const DEPLOY_DATA_DIR = join(homedir(), '.ai-english-tutor', 'data')
const DEV_DATA_DIR = join(REPO_ROOT, '.dev-data')
const DEFAULT_DATA_DIR = IS_DEPLOY ? DEPLOY_DATA_DIR : DEV_DATA_DIR

// ── Load .env file ──
// Deploy: ${DATA_DIR}/.env → ~/.ai-english-tutor/.env (legacy fallback).
// Dev:    <repo>/.env — single source of truth shared with frontend Vite.
const envPaths = IS_DEPLOY
  ? [
      join(process.env.DATA_DIR ?? DEPLOY_DATA_DIR, '.env'),
      join(homedir(), '.ai-english-tutor', '.env'),
    ]
  : [
      join(REPO_ROOT, '.env'),
    ]
for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    loadEnv({ path: envPath })
    break
  }
}

const DATA_DIR = process.env.DATA_DIR ?? DEFAULT_DATA_DIR

export const config = {
  /** HTTP server port */
  PORT: parseInt(process.env.PORT ?? '3000', 10),

  /** Node environment */
  NODE_ENV: process.env.NODE_ENV ?? 'development',

  /** Log level: debug | info | warn | error */
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',

  /** CORS allowed origins (comma-separated in env) */
  CORS_ORIGIN: (process.env.CORS_ORIGIN ?? '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  /** SSE heartbeat interval in milliseconds */
  SSE_HEARTBEAT_INTERVAL: parseInt(process.env.SSE_HEARTBEAT_INTERVAL ?? '30000', 10),

  // ── LLM Configuration ──

  /** LLM provider: 'xiaomi' | 'deepseek' | 'mock' */
  LLM_PROVIDER: process.env.LLM_PROVIDER ?? 'mock',

  /** DeepSeek API Key */
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ?? '',

  /** DeepSeek API Base URL */
  DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',

  /** DeepSeek Model */
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',

  // ── Xiaomi TTS Configuration ──

  /** Xiaomi MiMo TTS API Key (Token Plan format: tp-xxxxx) */
  XIAOMI_TTS_API_KEY: process.env.XIAOMI_TTS_API_KEY ?? '',

  /** Xiaomi MiMo TTS Base URL
   *  Token Plan: https://token-plan-{cn|sgp|ams}.xiaomimimo.com/v1
   *  Pay-as-you-go: https://api.xiaomimimo.com/v1
   */
  XIAOMI_TTS_BASE_URL: process.env.XIAOMI_TTS_BASE_URL ?? 'https://token-plan-cn.xiaomimimo.com/v1',

  /** Xiaomi MiMo TTS Mode: 'preset' | 'voicedesign' | 'voiceclone' */
  XIAOMI_TTS_MODE: process.env.XIAOMI_TTS_MODE ?? 'preset',

  /** Xiaomi MiMo TTS Voice (preset mode, e.g. 'Chloe', 'mimo_default') */
  XIAOMI_TTS_VOICE: process.env.XIAOMI_TTS_VOICE ?? 'Chloe',

  /** Xiaomi MiMo TTS Voice Design description (voicedesign mode)
   *  voicedesign 模式下、且 session 无角色人设时的英文兜底音色描述。默认慵懒御姐风。 */
  XIAOMI_TTS_VOICE_DESIGN: process.env.XIAOMI_TTS_VOICE_DESIGN ||
    '成熟知性的御姐，声线低沉磁性、略带沙哑，慵懒从容，语速偏慢，句尾带轻气声',

  /** Xiaomi MiMo TTS Voice Clone sample base64 (voiceclone mode) */
  XIAOMI_TTS_VOICE_CLONE: process.env.XIAOMI_TTS_VOICE_CLONE ?? '',

  /** Xiaomi MiMo TTS Voice Design for Chinese translation (warm Taiwanese female) */
  XIAOMI_TTS_ZH_VOICE_DESIGN: process.env.XIAOMI_TTS_ZH_VOICE_DESIGN ??
    '台湾腔温柔女声，语速适中，声音甜美温暖，像是一个亲切的台湾小姐姐在跟你说话',

  // ── Xiaomi LLM Configuration ──

  /** Xiaomi API Key */
  XIAOMI_API_KEY: process.env.XIAOMI_API_KEY ?? '',

  /** Xiaomi API Base URL (OpenAI-compatible endpoint) */
  XIAOMI_BASE_URL: process.env.XIAOMI_BASE_URL ?? 'https://api.xiaomi.com/v1',

  /** Xiaomi Model name */
  XIAOMI_MODEL: process.env.XIAOMI_MODEL ?? 'milm-pro',

  // ── Xiaomi ASR Configuration (independent from LLM) ──

  /** Xiaomi ASR API Key (falls back to XIAOMI_API_KEY) */
  XIAOMI_ASR_API_KEY: process.env.XIAOMI_ASR_API_KEY ?? process.env.XIAOMI_API_KEY ?? '',

  /** Xiaomi ASR Base URL (falls back to XIAOMI_BASE_URL) */
  XIAOMI_ASR_BASE_URL: process.env.XIAOMI_ASR_BASE_URL ?? process.env.XIAOMI_BASE_URL ?? 'https://api.xiaomimimo.com/v1',

  /** Xiaomi ASR Model name */
  XIAOMI_ASR_MODEL: process.env.XIAOMI_ASR_MODEL ?? 'mimo-v2.5-asr',

  // ── Database Configuration ──

  /** Database file path (SQLite) */
  DB_PATH: process.env.DB_PATH ?? join(DATA_DIR, 'tutor.db'),

  // ── Data directories ──

  /** Base directory for runtime-generated user data and deployment config. */
  DATA_DIR,

  /** TTS audio cache directory. */
  TTS_CACHE_DIR: process.env.TTS_CACHE_DIR ?? join(DATA_DIR, 'tts-cache'),

  /** Max total TTS cache size in MB (LRU eviction above this). */
  TTS_CACHE_MAX_MB: parseInt(process.env.TTS_CACHE_MAX_MB ?? '1024', 10),

  /** Max number of TTS cache files (LRU eviction above this). */
  TTS_CACHE_MAX_FILES: parseInt(process.env.TTS_CACHE_MAX_FILES ?? '5000', 10),

  /** Reusable-line pool directory (per scenario/level/voice spoken-line memory). */
  LINE_POOL_DIR: process.env.LINE_POOL_DIR ?? join(DATA_DIR, 'line-pool'),

  /** Max lines kept per line-pool group (lowest-frequency evicted above this). */
  LINE_POOL_MAX_LINES: parseInt(process.env.LINE_POOL_MAX_LINES ?? '200', 10),

  /** How many reusable lines to inject into the scenario prompt. */
  LINE_POOL_INJECT_LIMIT: parseInt(process.env.LINE_POOL_INJECT_LIMIT ?? '30', 10),

  /** Config directory for persona.json / scenarios.json / vocab lists. */
  CONFIG_DIR: process.env.CONFIG_DIR ?? DATA_DIR,

  // ── Voice Services Configuration ──

  /** TTS Provider: 'browser' | 'xiaomi' | 'cosyvoice' | 'volcengine' */
  TTS_PROVIDER: process.env.TTS_PROVIDER ?? 'browser',

  /** Default TTS voice */
  TTS_VOICE: process.env.TTS_VOICE ?? 'alloy',

  /** TTS audio format: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm' */
  TTS_FORMAT: process.env.TTS_FORMAT ?? 'mp3',

  /** TTS speed: 0.25 ~ 4.0 */
  TTS_SPEED: parseFloat(process.env.TTS_SPEED ?? '1.0'),

  /** ASR Provider: 'browser' | 'whisper' | 'xiaomi' */
  ASR_PROVIDER: process.env.ASR_PROVIDER ?? 'browser',

  /** ASR language: 'en' | 'zh' | 'auto' */
  ASR_LANGUAGE: process.env.ASR_LANGUAGE ?? 'auto',

  /** Audio upload max size in MB */
  MAX_AUDIO_SIZE_MB: parseInt(process.env.MAX_AUDIO_SIZE_MB ?? '10', 10),

  // ── CosyVoice Configuration ──

  /** CosyVoice API Base URL */
  COSYVOICE_BASE_URL: process.env.COSYVOICE_BASE_URL ?? 'http://localhost:50000',

  /** CosyVoice default speaker ID: 英文女 | 英文男 | 中文女 | 中文男 */
  COSYVOICE_SPK_ID: process.env.COSYVOICE_SPK_ID ?? '英文女',

  /** CosyVoice speech speed: 0.25 ~ 4.0 (teaching: ~0.9) */
  COSYVOICE_SPEED: parseFloat(process.env.COSYVOICE_SPEED ?? '0.9'),

  /**
   * Output sample rate of the CosyVoice server's raw PCM stream.
   * CosyVoice-300M-SFT = 22050, CosyVoice2-0.5B = 24000.
   * Used to build the WAV header that wraps the headerless PCM the server returns.
   */
  COSYVOICE_SAMPLE_RATE: parseInt(process.env.COSYVOICE_SAMPLE_RATE ?? '22050', 10),

  // ── Volcengine (火山引擎) 语音合成大模型 TTS Configuration ──
  // 纯 TTS（不提供 ASR）；HTTP 一次性合成 operation=query。
  // 音色由 voice_type 固定在服务端，前端不再选择音色（见 /api/config voiceStyleSelectable）。

  /** Volcengine TTS HTTP endpoint (一次性合成) */
  VOLCENGINE_TTS_BASE_URL:
    process.env.VOLCENGINE_TTS_BASE_URL ?? 'https://openspeech.bytedance.com/api/v1/tts',

  /** Volcengine 应用 App ID（控制台「语音合成大模型」获取） */
  VOLCENGINE_TTS_APP_ID: process.env.VOLCENGINE_TTS_APP_ID ?? '',

  /** Volcengine Access Token（鉴权用，header 形如 `Authorization: Bearer;{token}`） */
  VOLCENGINE_TTS_ACCESS_TOKEN: process.env.VOLCENGINE_TTS_ACCESS_TOKEN ?? '',

  /** Volcengine 业务集群：大模型音色用 volcano_tts */
  VOLCENGINE_TTS_CLUSTER: process.env.VOLCENGINE_TTS_CLUSTER ?? 'volcano_tts',

  /** Volcengine 大模型音色 ID（固定，前端不可选） */
  VOLCENGINE_TTS_VOICE_TYPE:
    process.env.VOLCENGINE_TTS_VOICE_TYPE ?? 'zh_female_gaolengyujie_moon_bigtts',

  /** Volcengine 输出音频编码：mp3 | wav | pcm | ogg_opus */
  VOLCENGINE_TTS_ENCODING: process.env.VOLCENGINE_TTS_ENCODING ?? 'mp3',

  // ── Whisper.cpp Configuration ──

  /** Whisper.cpp server Base URL */
  WHISPER_BASE_URL: process.env.WHISPER_BASE_URL ?? 'http://localhost:8080',

  /** Whisper model name for logging/reference */
  WHISPER_MODEL: process.env.WHISPER_MODEL ?? 'ggml-base.en.bin',
}

export type Config = typeof config

/** Derive ttsSource from TTS_PROVIDER: browser/unknown → local, xiaomi/cosyvoice/volcengine → remote */
export function getTtsSource(): 'local' | 'remote' {
  return config.TTS_PROVIDER === 'xiaomi' ||
    config.TTS_PROVIDER === 'cosyvoice' ||
    config.TTS_PROVIDER === 'volcengine'
    ? 'remote'
    : 'local'
}
