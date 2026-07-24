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
  'teacher.response': TeachingResponse
  'teacher.chunk': { chunk: string; isEnd: boolean }
  'teacher.audio': { audioBase64: string; format: string; isEnd: boolean }
  'teacher.interrupted': { reason?: 'user' }

  // 录音
  'recording.start': void
  'recording.stop': { durationMs: number; cancelled: boolean }
  'recording.volume': { volume: number }

  // 词汇
  'vocab.new': { words: string[] }

  // 系统
  error: { code: string; message: string }
  heartbeat: { timestamp: number }
}

export interface ChatRequestBody {
  type: 'user.speak' | 'lesson.start'
  text?: string
  level?: number
  sessionId?: string
  stream?: boolean
  audioBase64?: string
  audioFormat?: string
  styleName?: string
  scenarioId?: string
  userId?: string
  /** v2: 场景挑战的目标 CEFR 档（A1-C2） */
  targetLevel?: CEFRLevel
  /** v2: 从暂停快照恢复时携带的后端 sessionId */
  resumeFrom?: string
}

/** 后端返回的场景进度信息 */
export interface ScenarioProgress {
  id: string
  name: string
  icon: string
  targetWords: string[]
  targetWordsTotal: number
  wordsLearned: string[]
  completed?: boolean
  summary?: {
    wordsUsed: string[]
    wordsTotal: number
    turnsCount: number
  }
  /** v2: 当前挑战的 CEFR 档（A1-C2）。后端按用户档抽词后回填。 */
  level?: CEFRLevel
  /** v2: 当前已进行的轮次（用户每说一句 +1） */
  turnsCount?: number
  /** v2: 硬上限轮次，默认 20，到此强制结束 */
  maxTurns?: number
  /** v2: 词覆盖率 0-1（wordsLearned.length / targetWordsTotal） */
  coverageRate?: number
  /** v2: 通关星数。0 = 未达标（<60%），3/4/5 = 60%+/75%+/90%+ */
  stars?: 0 | 3 | 4 | 5
}

/**
 * v2: 每个用户对每个场景的累积进度（前端持久化在 store + localStorage）。
 * highestClearedLevel = null 表示该场景从未通关；通关一次后值升级。
 */
export interface UserScenarioProgress {
  scenarioId: string
  /** 已通关的最高档；null = 还没通关任何档 */
  highestClearedLevel: CEFRLevel | null
  /** 每档历史最高星数 */
  starsByLevel: Partial<Record<CEFRLevel, 3 | 4 | 5>>
  /** 总尝试次数（含失败/重玩） */
  attempts: number
  /** 最后一次进入该场景的时间戳 */
  lastPlayedAt: number
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

/** 词汇进度统计 */
export interface VocabProgress {
  totalWords: number
  learning: number
  mastered: number
  forgotten: number
  dueForReview: number
  masteryRate: number
}

/** 待复习单词 */
export interface ReviewWord {
  word: string
  level: string
  status: string
  nextReviewAt: number
  correctCount: number
  incorrectCount: number
}

/** 词汇同步项 */
export interface VocabSyncItem {
  word: string
  action: 'learn' | 'review'
  timestamp?: number
}
