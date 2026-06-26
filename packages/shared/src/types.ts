/** Available Live2D / Spine motions for the AI teacher */
export const AVAILABLE_MOTIONS = [
  'wave',        // 挥手打招呼
  'nod',         // 点头
  'think',       // 思考
  'gesture',     // 手势解释
  'clap',        // 鼓掌
  'point',       // 指向
  'write',       // 书写动作
  'surprised',   // 惊讶
] as const

export type MotionId = (typeof AVAILABLE_MOTIONS)[number]

/** Available Live2D / Spine expressions */
export const AVAILABLE_EXPRESSIONS = [
  'happy',
  'neutral',
  'curious',
  'surprised',
  'encouraging',
  'thoughtful',
] as const

export type ExpressionId = (typeof AVAILABLE_EXPRESSIONS)[number]

/** Type guard: is `id` a valid semantic motion ID? */
export function isMotionId(id: unknown): id is MotionId {
  return typeof id === 'string' && (AVAILABLE_MOTIONS as readonly string[]).includes(id)
}

/** Type guard: is `id` a valid semantic expression ID? */
export function isExpressionId(id: unknown): id is ExpressionId {
  return typeof id === 'string' && (AVAILABLE_EXPRESSIONS as readonly string[]).includes(id)
}

/**
 * Clamp an arbitrary value to a valid {@link MotionId}, falling back to
 * `fallback` when it is not one of {@link AVAILABLE_MOTIONS}. Keeps invalid
 * LLM output from reaching the frontend (where it would silently degrade to Idle).
 */
export function normalizeMotionId(id: unknown, fallback: MotionId = 'nod'): MotionId {
  return isMotionId(id) ? id : fallback
}

/** Clamp an arbitrary value to a valid {@link ExpressionId} (fallback `neutral`). */
export function normalizeExpressionId(id: unknown, fallback: ExpressionId = 'neutral'): ExpressionId {
  return isExpressionId(id) ? id : fallback
}

export interface TeachingResponse {
  text: string
  textZh?: string
  motionId?: string
  expressionId?: string
  vocabulary?: string[]
  /** Teaching example sentences — one per vocabulary word, showing usage in context. */
  vocabularySentences?: string[]
  /**
   * Learner-voiced reply suggestions: 1-3 short replies the student could say
   * NEXT, in their role's voice. Powers the 💡 hint in `ChatInputBar`.
   * Distinct from `vocabularySentences`, which are teaching examples.
   * Not persisted — per-turn ephemeral hints, refreshed each LLM turn.
   */
  studentReplyHints?: string[]
  scenario?: {
    id: string
    name: string
    icon: string
    targetWords: string[]
    targetWordsTotal: number
    wordsLearned: string[]
    completed?: boolean
  }
}

export interface TeachingInput {
  text: string
  level?: number
}

export interface SpeakOptions {
  rate?: number
  pitch?: number
  volume?: number
}

export type TTSSource = 'local' | 'remote'

export interface CharacterState {
  currentMotion: string | null
  currentExpression: string | null
  mouthOpen: number
}
