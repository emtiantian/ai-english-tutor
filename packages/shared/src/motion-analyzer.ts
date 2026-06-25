import type { MotionId, ExpressionId } from './types.js'

/**
 * Result of analyzing text for motion/expression selection
 */
export interface MotionAnalysisResult {
  motionId: MotionId
  expressionId: ExpressionId
  /** Name of the matched intent (for logging/debugging) */
  intent: string
}

/**
 * MotionAnalyzer — maps AI response text to a semantic motion/expression.
 *
 * This is the **text → semantic ID** layer, complementing MotionRegistry
 * which handles **semantic ID → model-specific key**.
 *
 * Implement this interface to customize motion selection per character
 * or per language. The default `KeywordMotionAnalyzer` uses English keyword
 * matching and works for most teaching scenarios.
 */
export interface MotionAnalyzer {
  /** Analyze text and return the best-matching motion/expression */
  analyze(text: string): MotionAnalysisResult
}

// ────────────────────────────────────────────────────────────
// Default implementation: keyword-based intent detection
// ────────────────────────────────────────────────────────────

interface IntentRule {
  /** Unique intent name for logging */
  intent: string
  /** Keywords or regex patterns to match against the text */
  patterns: Array<string | RegExp>
  /** Motion to play when matched */
  motionId: MotionId
  /** Expression to show when matched */
  expressionId: ExpressionId
  /** Higher = checked first (default 0) */
  priority?: number
}

/**
 * Intent detection rules, ordered by priority (highest first).
 * The first matching rule wins.
 */
const INTENT_RULES: IntentRule[] = [
  // ─── Greeting ────────────────────────────────────────────
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

  // ─── Farewell ────────────────────────────────────────────
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

  // ─── Surprise ────────────────────────────────────────────
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

  // ─── Praising / Congratulating ───────────────────────────
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

  // ─── Correcting a mistake ────────────────────────────────
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

  // ─── Asking a question ───────────────────────────────────
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

  // ─── Pointing / Example ──────────────────────────────────
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

  // ─── Writing / Note-taking ───────────────────────────────
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

  // ─── Introducing new content ─────────────────────────────
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

  // ─── Explaining / Teaching ───────────────────────────────
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

  // ─── Student got it wrong (mild) ─────────────────────────
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
 * Default MotionAnalyzer — uses keyword/regex matching to detect teaching intent.
 *
 * Works well for English teaching scenarios. For other languages or domains,
 * implement the `MotionAnalyzer` interface with custom rules.
 */
export class KeywordMotionAnalyzer implements MotionAnalyzer {
  private readonly rules: IntentRule[]

  constructor(customRules?: IntentRule[]) {
    // Sort by priority descending so highest-priority rules are checked first
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

    // Default fallback
    return { motionId: 'nod', expressionId: 'neutral', intent: 'default' }
  }
}

/** Singleton default instance */
export const defaultMotionAnalyzer: MotionAnalyzer = new KeywordMotionAnalyzer()
