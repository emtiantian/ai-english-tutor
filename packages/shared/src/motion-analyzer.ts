import type { MotionId, ExpressionId } from './types.js'

/**
 * 文本动作/表情选择分析结果
 */
export interface MotionAnalysisResult {
  motionId: MotionId
  expressionId: ExpressionId
  /** 匹配到的意图名称（用于日志/调试） */
  intent: string
}

/**
 * MotionAnalyzer —— 将 AI 回复文本映射为语义动作/表情。
 *
 * 这是 **文本 → 语义 ID** 层，与负责 **语义 ID → 模型专属 key**
 * 的 MotionRegistry 互补。
 *
 * 实现该接口可按角色或按语言自定义动作选择。
 * 默认的 `KeywordMotionAnalyzer` 使用英文关键词匹配，适用于大多数教学场景。
 */
export interface MotionAnalyzer {
  /** 分析文本并返回最匹配的动作/表情 */
  analyze(text: string): MotionAnalysisResult
}

// ────────────────────────────────────────────────────────────
// 默认实现：基于关键词的意图识别
// ────────────────────────────────────────────────────────────

interface IntentRule {
  /** 唯一意图名称，用于日志 */
  intent: string
  /** 用于匹配文本的关键词或正则模式 */
  patterns: Array<string | RegExp>
  /** 匹配时播放的动作 */
  motionId: MotionId
  /** 匹配时展示的表情 */
  expressionId: ExpressionId
  /** 数值越高越先匹配（默认 0） */
  priority?: number
}

/**
 * 意图识别规则，按优先级排序（高的在前）。
 * 首个匹配的规则生效。
 */
const INTENT_RULES: IntentRule[] = [
  // ─── 问候 ────────────────────────────────────────────
  {
    intent: 'greeting',
    patterns: [
      /\b(hi|hello|hey|welcome|good\s+(morning|afternoon|evening)|greetings)\b/i,
      /\b(nice to (meet|see)|glad.*(here|back)|ready to (start|learn|go))\b/i,
      /\b(let'?s (get )?(start|go|begin))\b/i,
    ],
    motionId: 'wave',
    expressionId: 'happy',
    priority: 10,
  },

  // ─── 告别 ────────────────────────────────────────────
  {
    intent: 'farewell',
    patterns: [
      /\b(bye|goodbye|see you|farewell|take care|until next)\b/i,
      /\b(great (session|job|work)|that'?s (all|it) for today)\b/i,
    ],
    motionId: 'wave',
    expressionId: 'happy',
    priority: 10,
  },

  // ─── 惊讶 ────────────────────────────────────────────
  {
    intent: 'surprise',
    patterns: [
      /\b(wow|whoa|amazing|incredible|unbelievable|unexpected)\b/i,
      /\b(?!.*\bnot\b)(surpris|astonish|shock)\w*\b/i,
      /[!！]{2,}/,
    ],
    motionId: 'surprised',
    expressionId: 'surprised',
    priority: 8,
  },

  // ─── 表扬 / 祝贺 ─────────────────────────────────────
  {
    intent: 'praise',
    patterns: [
      /\b(excellent|wonderful|fantastic|amazing|great job|well done|perfect)\b/i,
      /\b(brilliant|outstanding|impressive|superb|terrific)\b/i,
      /\b(you (got|did|nailed|crushed) it|that'?s (right|correct|perfect))\b/i,
      /\b(congratulat|proud of you|keep it up)\b/i,
      /[🎉👏✨🌟💪🔥]{1,}/,
    ],
    motionId: 'clap',
    expressionId: 'happy',
    priority: 7,
  },

  // ─── 纠正错误 ────────────────────────────────────────
  {
    intent: 'correction',
    patterns: [
      /\b(not quite|almost|close|let me (correct|fix|help))\b/i,
      /\b(the (correct|right) (way|form|answer|word) (is|would be))\b/i,
      /\b(try (again|this instead)|actually|it should be|we say)\b/i,
      /\b(small (mistake|error|correction)|just a (minor|tiny))\b/i,
      /\b(remember to|careful with|watch out for)\b/i,
    ],
    motionId: 'gesture',
    expressionId: 'encouraging',
    priority: 6,
  },

  // ─── 提问 ───────────────────────────────────────────
  {
    intent: 'question',
    patterns: [
      /[?？]\s*$/,
      /\b(can you|could you|would you|do you|did you|have you)\b/i,
      /\b(what|how|why|when|where|who|which)\b.*[?？]/i,
      /\b(tell me|think about|guess|try to)\b/i,
      /\b(what (do you|does|is|are)|how (do|does|can|would))\b/i,
    ],
    motionId: 'think',
    expressionId: 'curious',
    priority: 5,
  },

  // ─── 指向 / 示例 ─────────────────────────────────────
  {
    intent: 'pointing',
    patterns: [
      /\b(look at|see (this|here|below)|for example|for instance|such as)\b/i,
      /\b(here (is|are)|notice (that|how)|as you can see)\b/i,
      /\b(this (word|phrase|sentence|means))\b/i,
    ],
    motionId: 'point',
    expressionId: 'neutral',
    priority: 4,
  },

  // ─── 书写 / 记笔记 ───────────────────────────────────
  {
    intent: 'writing',
    patterns: [
      /\b(write (it|this|that|down)|note(down)?|jot down|take notes)\b/i,
      /\b(let me write|on the board|let'?s spell)\b/i,
      /\b(remember this|write it out)\b/i,
    ],
    motionId: 'write',
    expressionId: 'thoughtful',
    priority: 4,
  },

  // ─── 引入新内容 ──────────────────────────────────────
  {
    intent: 'introducing',
    patterns: [
      /\b(today we'?ll|let'?s learn|new (word|vocabulary|grammar|topic))\b/i,
      /\b(introducing|first (up|thing)|we'?re going to (learn|explore|discover))\b/i,
      /\b(here'?s a (new|useful)|pay attention to)\b/i,
    ],
    motionId: 'gesture',
    expressionId: 'curious',
    priority: 3,
  },

  // ─── 解释 / 教学 ─────────────────────────────────────
  {
    intent: 'explaining',
    patterns: [
      /\b(this means|the meaning|in (other words|English|simple terms))\b/i,
      /\b(explain|let me (show|help)|basically|essentially|in short)\b/i,
      /\b(you (can|should|need to)|it'?s (used|like|similar))\b/i,
      /\b(the (difference|rule|structure|pattern))\b/i,
    ],
    motionId: 'gesture',
    expressionId: 'neutral',
    priority: 2,
  },

  // ─── 学生答错（轻微） ────────────────────────────────
  {
    intent: 'mild-wrong',
    patterns: [
      /\b(hmm|well|not exactly|not really|that'?s not quite)\b/i,
      /\b(try again|let'?s try|one more time|think again)\b/i,
    ],
    motionId: 'nod',
    expressionId: 'thoughtful',
    priority: 1,
  },
]

/**
 * 默认 MotionAnalyzer —— 使用关键词/正则匹配识别教学意图。
 *
 * 在英语教学场景中表现良好。如需支持其他语言或领域，
 * 可实现 `MotionAnalyzer` 接口并编写自定义规则。
 */
export class KeywordMotionAnalyzer implements MotionAnalyzer {
  private readonly rules: IntentRule[]

  constructor(customRules?: IntentRule[]) {
    // 按优先级降序排序，确保高优先级规则先被检查
    this.rules = [...(customRules ?? INTENT_RULES)].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    )
  }

  analyze(text: string): MotionAnalysisResult {
    if (!text || text.trim().length === 0) {
      return { motionId: 'nod', expressionId: 'neutral', intent: 'empty' }
    }

    for (const rule of this.rules) {
      for (const pattern of rule.patterns) {
        const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern
        if (regex.test(text)) {
          return {
            motionId: rule.motionId,
            expressionId: rule.expressionId,
            intent: rule.intent,
          }
        }
      }
    }

    // 默认兜底
    return { motionId: 'nod', expressionId: 'neutral', intent: 'default' }
  }
}

/** 默认单例实例 */
export const defaultMotionAnalyzer: MotionAnalyzer = new KeywordMotionAnalyzer()
