/**
 * 配置 - 加载环境变量并提供合理默认值
 *
 * 若存在 .env 文件则自动加载（无需额外依赖）。
 */
import { config as loadEnv } from 'dotenv'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { homedir } from 'os'
import { existsSync } from 'fs'

// ── 模式检测 ──
// 当 NODE_ENV=production 时触发部署模式（由 docker-compose 或 `start:deploy` 包脚本显式设置）。
// 其他情况均视为本地开发。
//
// 两种模式在以下方面不同：
// 1. .env 加载：部署模式读取 ~/.ai-english-tutor/data/.env（并兼容旧版 ~/.ai-english-tutor/.env）；
//    开发模式只读取 <repo>/.env —— 与前端 Vite 共用同一文件（envDir 指向仓库根）。
// 2. DATA_DIR 默认值：部署 → ~/.ai-english-tutor/data；开发 → <repo>/.dev-data（gitignored）。
//
// 这样 ~/.ai-english-tutor/ 完全是部署产物 —— 本地开发不会读取或写入该目录。
export const IS_DEPLOY = process.env.NODE_ENV === 'production'

const __dirname = dirname(fileURLToPath(import.meta.url))
// 开发模式下（`tsx src/index.ts`）__dirname 是 .../apps/tutor-server/src；构建后
//（`node dist/index.js`）是 .../apps/tutor-server/dist。无论哪种情况，`../` 都指向服务端包根目录。
const SERVER_PKG_ROOT = resolve(__dirname, '..')
// <repo-root>：服务端包位于 apps/tutor-server，因此向上两级到达仓库根目录。
const REPO_ROOT = resolve(SERVER_PKG_ROOT, '..', '..')

// ── 解析 DATA_DIR 默认值 ──
const DEPLOY_DATA_DIR = join(homedir(), '.ai-english-tutor', 'data')
const DEV_DATA_DIR = join(REPO_ROOT, '.dev-data')
const DEFAULT_DATA_DIR = IS_DEPLOY ? DEPLOY_DATA_DIR : DEV_DATA_DIR

// ── 加载 .env 文件 ──
// 部署：${DATA_DIR}/.env → ~/.ai-english-tutor/.env（旧版兼容）。
// 开发：<repo>/.env —— 与前端 Vite 共用单一来源。
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
  /** HTTP 服务器端口 */
  PORT: parseInt(process.env.PORT ?? '3000', 10),

  /** Node 环境 */
  NODE_ENV: process.env.NODE_ENV ?? 'development',

  /** 日志级别：debug | info | warn | error */
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',

  /** CORS 允许的源（环境中用逗号分隔） */
  CORS_ORIGIN: (process.env.CORS_ORIGIN ?? '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  /** SSE 心跳间隔，单位毫秒 */
  SSE_HEARTBEAT_INTERVAL: parseInt(process.env.SSE_HEARTBEAT_INTERVAL ?? '30000', 10),

  // ── LLM 配置 ──

  /** LLM 服务商：'xiaomi' | 'deepseek' | 'mock' */
  LLM_PROVIDER: process.env.LLM_PROVIDER ?? 'mock',

  /** DeepSeek API 密钥 */
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ?? '',

  /** DeepSeek API 基础地址 */
  DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',

  /** DeepSeek 模型 */
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',

  // ── 小米 TTS 配置 ──

  /** 小米 MiMo TTS API 密钥（Token Plan 格式：tp-xxxxx） */
  XIAOMI_TTS_API_KEY: process.env.XIAOMI_TTS_API_KEY ?? '',

  /** 小米 MiMo TTS 基础地址
   *  Token Plan: https://token-plan-{cn|sgp|ams}.xiaomimimo.com/v1
   *  按量付费: https://api.xiaomimimo.com/v1
   */
  XIAOMI_TTS_BASE_URL: process.env.XIAOMI_TTS_BASE_URL ?? 'https://token-plan-cn.xiaomimimo.com/v1',

  /** 小米 MiMo TTS 模式：'preset' | 'voicedesign' | 'voiceclone' */
  XIAOMI_TTS_MODE: process.env.XIAOMI_TTS_MODE ?? 'preset',

  /** 小米 MiMo TTS 音色（preset 模式，例如 'Chloe'、'mimo_default'） */
  XIAOMI_TTS_VOICE: process.env.XIAOMI_TTS_VOICE ?? 'Chloe',

  /** 小米 MiMo TTS 音色设计描述（voicedesign 模式）
   *  voicedesign 模式下、且 session 无角色人设时的英文兜底音色描述。默认慵懒御姐风。 */
  XIAOMI_TTS_VOICE_DESIGN: process.env.XIAOMI_TTS_VOICE_DESIGN ||
    '成熟知性的御姐，声线低沉磁性、略带沙哑，慵懒从容，语速偏慢，句尾带轻气声',

  /** 小米 MiMo TTS 声音克隆样本 base64（voiceclone 模式） */
  XIAOMI_TTS_VOICE_CLONE: process.env.XIAOMI_TTS_VOICE_CLONE ?? '',

  /** 小米 MiMo TTS 中文翻译音色设计（温暖的台湾女声） */
  XIAOMI_TTS_ZH_VOICE_DESIGN: process.env.XIAOMI_TTS_ZH_VOICE_DESIGN ??
    '台湾腔温柔女声，语速适中，声音甜美温暖，像是一个亲切的台湾小姐姐在跟你说话',

  // ── 小米 LLM 配置 ──

  /** 小米 API Key */
  XIAOMI_API_KEY: process.env.XIAOMI_API_KEY ?? '',

  /** 小米 API Base URL（兼容 OpenAI 的端点） */
  XIAOMI_BASE_URL: process.env.XIAOMI_BASE_URL ?? 'https://api.xiaomi.com/v1',

  /** 小米模型名称 */
  XIAOMI_MODEL: process.env.XIAOMI_MODEL ?? 'milm-pro',

  // ── 小米 ASR 配置（独立于 LLM）──

  /** 小米 ASR API Key（回退到 XIAOMI_API_KEY） */
  XIAOMI_ASR_API_KEY: process.env.XIAOMI_ASR_API_KEY ?? process.env.XIAOMI_API_KEY ?? '',

  /** 小米 ASR Base URL（回退到 XIAOMI_BASE_URL） */
  XIAOMI_ASR_BASE_URL: process.env.XIAOMI_ASR_BASE_URL ?? process.env.XIAOMI_BASE_URL ?? 'https://api.xiaomimimo.com/v1',

  /** 小米 ASR 模型名称 */
  XIAOMI_ASR_MODEL: process.env.XIAOMI_ASR_MODEL ?? 'mimo-v2.5-asr',

  // ── 数据库配置 ──

  /** 数据库文件路径（SQLite） */
  DB_PATH: process.env.DB_PATH ?? join(DATA_DIR, 'tutor.db'),

  // ── 数据目录 ──

  /** 运行时生成的用户数据与部署配置根目录。 */
  DATA_DIR,

  /** TTS 音频缓存目录。 */
  TTS_CACHE_DIR: process.env.TTS_CACHE_DIR ?? join(DATA_DIR, 'tts-cache'),

  /** TTS 缓存总大小上限，单位 MB（超出后按 LRU 淘汰）。 */
  TTS_CACHE_MAX_MB: parseInt(process.env.TTS_CACHE_MAX_MB ?? '1024', 10),

  /** TTS 缓存文件数量上限（超出后按 LRU 淘汰）。 */
  TTS_CACHE_MAX_FILES: parseInt(process.env.TTS_CACHE_MAX_FILES ?? '5000', 10),

  /** 可复用语料池目录（按场景/等级/音色记录已说过的话）。 */
  LINE_POOL_DIR: process.env.LINE_POOL_DIR ?? join(DATA_DIR, 'line-pool'),

  /** 每个语料池分组保留的最大条数（超出后淘汰出现频率最低的）。 */
  LINE_POOL_MAX_LINES: parseInt(process.env.LINE_POOL_MAX_LINES ?? '200', 10),

  /** 向场景提示注入多少条可复用语料。 */
  LINE_POOL_INJECT_LIMIT: parseInt(process.env.LINE_POOL_INJECT_LIMIT ?? '30', 10),

  /** persona.json / scenarios.json / 词汇表等配置目录。 */
  CONFIG_DIR: process.env.CONFIG_DIR ?? DATA_DIR,

  // ── 语音服务配置 ──

  /** TTS 服务商：'browser' | 'xiaomi' | 'cosyvoice' | 'volcengine' */
  TTS_PROVIDER: process.env.TTS_PROVIDER ?? 'browser',

  /** 默认 TTS 音色 */
  TTS_VOICE: process.env.TTS_VOICE ?? 'alloy',

  /** TTS 音频格式：'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm' */
  TTS_FORMAT: process.env.TTS_FORMAT ?? 'mp3',

  /** TTS 语速：0.25 ~ 4.0 */
  TTS_SPEED: parseFloat(process.env.TTS_SPEED ?? '1.0'),

  /** ASR 服务商：'browser' | 'whisper' | 'xiaomi' | 'volcengine' */
  ASR_PROVIDER: process.env.ASR_PROVIDER ?? 'browser',

  /** ASR 语言：'en' | 'zh' | 'auto' */
  ASR_LANGUAGE: process.env.ASR_LANGUAGE ?? 'auto',

  /** 音频上传最大尺寸，单位 MB */
  MAX_AUDIO_SIZE_MB: parseInt(process.env.MAX_AUDIO_SIZE_MB ?? '10', 10),

  // ── CosyVoice 配置 ──

  /** CosyVoice API 基础地址 */
  COSYVOICE_BASE_URL: process.env.COSYVOICE_BASE_URL ?? 'http://localhost:50000',

  /** CosyVoice 默认说话人 ID：英文女 | 英文男 | 中文女 | 中文男 */
  COSYVOICE_SPK_ID: process.env.COSYVOICE_SPK_ID ?? '英文女',

  /** CosyVoice 语速：0.25 ~ 4.0（教学场景建议 ~0.9） */
  COSYVOICE_SPEED: parseFloat(process.env.COSYVOICE_SPEED ?? '0.9'),

  /**
   * CosyVoice 服务端原始 PCM 流的输出采样率。
   * CosyVoice-300M-SFT = 22050，CosyVoice2-0.5B = 24000。
   * 用于构建包裹服务端返回的无头 PCM 的 WAV 头。
   */
  COSYVOICE_SAMPLE_RATE: parseInt(process.env.COSYVOICE_SAMPLE_RATE ?? '22050', 10),

  // ── Volcengine (火山方舟 Agent Plan) 语音合成 TTS 配置 ──
  // 接口：openspeech.bytedance.com/api/v3/plan/tts/unidirectional
  // 鉴权：X-Api-Key + X-Api-Resource-Id

  /** Volcengine 方舟 Agent Plan 专属 API Key */
  VOLCENGINE_TTS_API_KEY: process.env.VOLCENGINE_TTS_API_KEY ?? '',

  /** Volcengine TTS Resource ID（模型标识） */
  VOLCENGINE_TTS_RESOURCE_ID: process.env.VOLCENGINE_TTS_RESOURCE_ID ?? 'seed-tts-2.0',

  /** Volcengine TTS HTTP endpoint（HTTP 单向流式/一次性合成） */
  VOLCENGINE_TTS_BASE_URL:
    process.env.VOLCENGINE_TTS_BASE_URL ??
    'https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional',

  /** Volcengine TTS 音色 speaker */
  VOLCENGINE_TTS_SPEAKER:
    process.env.VOLCENGINE_TTS_SPEAKER ?? 'zh_female_gaolengyujie_uranus_bigtts',

  /** Volcengine TTS 输出格式 */
  VOLCENGINE_TTS_FORMAT: process.env.VOLCENGINE_TTS_FORMAT ?? 'mp3',

  /** Volcengine TTS 采样率 */
  VOLCENGINE_TTS_SAMPLE_RATE: parseInt(process.env.VOLCENGINE_TTS_SAMPLE_RATE ?? '24000', 10),

  // ── Volcengine (火山方舟 Agent Plan) 语音识别 ASR 配置 ──
  // 接口：wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream
  // 鉴权：X-Api-Key + X-Api-Resource-Id；二进制 WebSocket 帧协议

  /** Volcengine 方舟 Agent Plan 专属 API Key（ASR 可独立配置；为空则回退到 TTS key） */
  VOLCENGINE_ASR_API_KEY: process.env.VOLCENGINE_ASR_API_KEY ?? process.env.VOLCENGINE_TTS_API_KEY ?? '',

  /** Volcengine ASR Resource ID（模型标识） */
  VOLCENGINE_ASR_RESOURCE_ID: process.env.VOLCENGINE_ASR_RESOURCE_ID ?? 'volc.seedasr.sauc.duration',

  /** Volcengine ASR WebSocket 端点 */
  VOLCENGINE_ASR_BASE_URL:
    process.env.VOLCENGINE_ASR_BASE_URL ??
    'wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream',

  /** Volcengine ASR 音频分段发送间隔（毫秒） */
  VOLCENGINE_ASR_SEGMENT_MS: parseInt(process.env.VOLCENGINE_ASR_SEGMENT_MS ?? '200', 10),

  // ── Whisper.cpp 配置 ──

  /** Whisper.cpp 服务器 Base URL */
  WHISPER_BASE_URL: process.env.WHISPER_BASE_URL ?? 'http://localhost:8080',

  /** Whisper 模型文件名（docker-compose.whisper.yml 与部署脚本下载/挂载用） */
  WHISPER_MODEL: process.env.WHISPER_MODEL ?? 'ggml-base.en.bin',
}

export type Config = typeof config

/** 根据 TTS_PROVIDER 推导 ttsSource：browser/unknown → local，xiaomi/cosyvoice/volcengine → remote */
export function getTtsSource(): 'local' | 'remote' {
  return config.TTS_PROVIDER === 'xiaomi' ||
    config.TTS_PROVIDER === 'cosyvoice' ||
    config.TTS_PROVIDER === 'volcengine'
    ? 'remote'
    : 'local'
}
