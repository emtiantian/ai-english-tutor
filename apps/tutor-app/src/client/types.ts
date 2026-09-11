/**
 * TutorClient 事件类型定义
 *
 * 所有事件都通过 mitt 发出，由以下模块消费：
 * - Pinia store（UI 状态）
 * - AudioPlayer（TTS 播放）
 * - App.vue（角色动画）
 */

import type {
  TeachingResponse,
  CEFRLevel,
  WordExplanation,
  WordSense
} from '@ai-english-tutor/shared'
export type { TeachingResponse, CEFRLevel, WordExplanation, WordSense }

export interface TutorEventMap {
  [key: string]: unknown
  [key: symbol]: unknown
  // 连接状态
  connected: void
  disconnected: { reason: string }
  reconnecting: { attempt: number; delayMs: number }

  // 服务端配置（连接时发送一次）
  config: { ttsSource: 'local' | 'remote' }

  // 消息（用于 UI 聊天记录）
  'message.user': { text: string; sessionId?: string; isVoice: boolean }
  'message.assistant': TeachingResponse & { sessionId?: string }

  // AI 状态
  'state.thinking': void

  // SSE 原始事件
  'teacher.response': TeachingResponse & { requestId?: string }
  'teacher.chunk': { chunk: string; isEnd: boolean; requestId?: string }
  'teacher.audio': { audioBase64: string; format: string; isEnd: boolean; requestId?: string }
  'teacher.interrupted': { reason?: 'user'; requestId?: string }

  // 录音
  'recording.start': void
  'recording.stop': { durationMs: number; cancelled: boolean }
  'recording.volume': { volume: number }

  // 词汇
  'vocab.new': { words: string[] }

  // 系统
  error: { code: string; message: string; requestId?: string }
  heartbeat: { timestamp: number }
}

export interface ChatRequestBody {
  type: 'user.speak' | 'lesson.start'
  text?: string
  level?: number
  sessionId?: string
  /** 一次生成请求的唯一 ID，用于过滤打断后迟到的 SSE 数据。 */
  requestId?: string
  stream?: boolean
  scenarioId?: string
  /** User-selected Xiaomi Voice Design description, independent of scenario. */
  voiceDesign?: string
}

export interface ScenarioSummary {
  id: string
  name: string
  nameEn: string
  icon: string
}

export interface RuntimeConfig {
  asrProvider: string
  ttsProvider: string
  voiceStyleSelectable?: boolean
}

/** 后端返回的场景进度信息 */
export interface ScenarioProgress {
  id: string
  name: string
  icon: string
  targetWords: string[]
  targetWordsTotal: number
  wordsLearned: string[]
}

export interface ChatResponse {
  text: string
  transcript?: string
  motionId?: string
  expressionId?: string
  vocabulary?: string[]
  vocabularySentences?: string[]
  /** 学习者口吻的回复建议（用于 💡 提示）。 */
  studentReplyHints?: string[]
  audioBase64?: string
  sessionId?: string
  scenario?: ScenarioProgress
}
