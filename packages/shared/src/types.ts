/** AI 老师可用的 Live2D / Spine 动作 */
export const AVAILABLE_MOTIONS = [
  'wave', // 挥手打招呼
  'nod', // 点头
  'think', // 思考
  'gesture', // 手势解释
  'clap', // 鼓掌
  'point', // 指向
  'write', // 书写动作
  'surprised' // 惊讶
] as const

export type MotionId = (typeof AVAILABLE_MOTIONS)[number]

/** 可用的 Live2D / Spine 表情 */
export const AVAILABLE_EXPRESSIONS = [
  'happy',
  'neutral',
  'curious',
  'surprised',
  'encouraging',
  'thoughtful'
] as const

export type ExpressionId = (typeof AVAILABLE_EXPRESSIONS)[number]

/** 类型守卫：id 是否为有效的语义动作 ID */
export function isMotionId(id: unknown): id is MotionId {
  return typeof id === 'string' && (AVAILABLE_MOTIONS as readonly string[]).includes(id)
}

/** 类型守卫：id 是否为有效的语义表情 ID */
export function isExpressionId(id: unknown): id is ExpressionId {
  return typeof id === 'string' && (AVAILABLE_EXPRESSIONS as readonly string[]).includes(id)
}

/**
 * 将任意值限制为有效的 {@link MotionId}；若不在 {@link AVAILABLE_MOTIONS} 中，
 * 则回退到 `fallback`。防止无效的 LLM 输出到达前端（否则会静默降级为 Idle）。
 */
export function normalizeMotionId(id: unknown, fallback: MotionId = 'nod'): MotionId {
  return isMotionId(id) ? id : fallback
}

/** 将任意值限制为有效的 {@link ExpressionId}（回退 `neutral`）。 */
export function normalizeExpressionId(
  id: unknown,
  fallback: ExpressionId = 'neutral'
): ExpressionId {
  return isExpressionId(id) ? id : fallback
}

export interface TeachingResponse {
  text: string
  textZh?: string
  motionId?: string
  expressionId?: string
  vocabulary?: string[]
  /** 教学例句 —— 每个生词一个，展示在语境中的用法。 */
  vocabularySentences?: string[]
  /**
   * 学习者视角的回复建议：1-3 句学生接下来可以说的简短回复，
   * 使用其角色口吻。为 `ChatInputBar` 中的 💡 提示提供内容。
   * 与 `vocabularySentences`（教学例句）不同。
   * 不持久化 —— 每轮临时的提示，每次 LLM 回复后刷新。
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

/** 字典式解释中单词的一个义项（词义条目）。 */
export interface WordSense {
  /** 词性，如 n. / v. / adj. / adv. / phrase */
  pos: string
  /** 中文释义 */
  meaningZh: string
  /** 英文例句 */
  exampleEn?: string
  /** 例句中文翻译 */
  exampleZh?: string
}

/** POST /api/vocab/explain 返回的结构化词典条目。 */
export interface WordExplanation {
  /** 单词原形 */
  word: string
  /** 音标（IPA，含两侧斜杠），如 /əˈbændən/ */
  phonetic?: string
  /** CEFR 等级（若已知） */
  level?: string
  /** 多义项 */
  senses: WordSense[]
  /** 近义词 */
  synonyms?: string[]
  /** 用法/搭配笔记（中文） */
  usageNoteZh?: string
}
