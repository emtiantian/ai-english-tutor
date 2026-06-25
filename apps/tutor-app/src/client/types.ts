/**
 * TutorClient Event Type Definitions
 *
 * All events are emitted via mitt and consumed by:
 * - Pinia store (UI state)
 * - AudioPlayer (TTS playback)
 * - App.vue (character animation)
 */

import type { TeachingResponse, CEFRLevel } from '@ai-english-tutor/shared'
export type { TeachingResponse, CEFRLevel }

export interface TutorEventMap {
  [key: string]: unknown
  [key: symbol]: unknown
  // Connection state
  'connected': void
  'disconnected': { reason: string }
  'reconnecting': { attempt: number; delayMs: number }

  // Server config (sent once on connect)
  'config': { ttsSource: 'local' | 'remote' }

  // Messages (for UI chat history)
  'message.user': { text: string; sessionId?: string; isVoice: boolean }
  'message.assistant': TeachingResponse & { sessionId?: string }

  // AI state
  'state.thinking': void
  'state.idle': void

  // SSE raw events
  'teacher.response': TeachingResponse
  'teacher.chunk': { chunk: string; isEnd: boolean }
  'teacher.audio': { audioBase64: string; format: string; isEnd: boolean }
  'teacher.chinese-audio': { audioBase64: string; format: string; isEnd: boolean }
  'level.result': { level: number; reason: string }

  // Recording
  'recording.start': void
  'recording.stop': { durationMs: number; cancelled: boolean }
  'recording.volume': { volume: number }

  // TTS
  'tts.start': { text: string; source: 'remote' | 'local' }
  'tts.end': { source: 'remote' | 'local' }


  // Vocabulary
  'vocab.new': { words: string[] }

  // System
  'error': { code: string; message: string }
  'heartbeat': { timestamp: number }
}

export interface ChatRequestBody {
  type: 'user.speak' | 'level.check' | 'lesson.start' | 'level.assess'
  text?: string
  level?: number
  sessionId?: string
  stream?: boolean
  audioBase64?: string
  audioFormat?: string
  styleName?: string
  scenarioId?: string
  userId?: string
  round?: number
  previousScores?: number[]
  topicSeed?: string
  /** v2: 场景挑战的目标 CEFR 档（A1-C2） */
  targetLevel?: CEFRLevel
  /** v2: 从暂停快照恢复时携带的后端 sessionId */
  resumeFrom?: string
}

/** Multi-turn assessment response */
export interface AssessmentResponse {
  round: number
  scores: {
    vocabulary: number
    grammar: number
    fluency: number
    comprehension: number
  }
  overallLevel: number
  confidence: string
  reason: string
  transcript?: string
  nextQuestion?: string
  motionId?: string
  expressionId?: string
  audioBase64?: string
  isComplete: boolean
}

/** Scenario progress info from backend */
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
  /** Learner-voiced reply suggestions (powers the 💡 hint). */
  studentReplyHints?: string[]
  audioBase64?: string
  sessionId?: string
  scenario?: ScenarioProgress
}

/** Vocabulary progress statistics */
export interface VocabProgress {
  totalWords: number
  learning: number
  mastered: number
  forgotten: number
  dueForReview: number
  masteryRate: number
}

/** Word due for review */
export interface ReviewWord {
  word: string
  level: string
  status: string
  nextReviewAt: number
  correctCount: number
  incorrectCount: number
}

/** Vocabulary sync item */
export interface VocabSyncItem {
  word: string
  action: 'learn' | 'review'
  timestamp?: number
}
