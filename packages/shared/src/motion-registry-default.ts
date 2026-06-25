import { AVAILABLE_MOTIONS, AVAILABLE_EXPRESSIONS } from './types.js'
import type { MotionId, ExpressionId } from './types.js'
import type { MotionRegistry, MotionMapping, ExpressionMapping } from './motion-registry.js'

/**
 * Hiyori model motion mapping
 *
 * Maps semantic motion IDs to the Hiyori Live2D model's Idle group indices.
 * The model has 9 Idle motions (m01-m03, m05-m10) and 1 TapBody motion (m04).
 * We map the 8 semantic IDs to Idle_0 through Idle_7.
 */
const HIYORI_MOTION_MAP: Record<MotionId, string> = {
  wave: 'Idle_0',       // Hiyori_m01 — 挥手
  nod: 'Idle_1',        // Hiyori_m02 — 点头
  think: 'Idle_2',      // Hiyori_m03 — 思考
  gesture: 'Idle_3',    // Hiyori_m05 — 手势
  clap: 'Idle_4',       // Hiyori_m06 — 鼓掌
  point: 'Idle_5',      // Hiyori_m07 — 指向
  write: 'Idle_6',      // Hiyori_m08 — 书写
  surprised: 'Idle_7',  // Hiyori_m09 — 惊讶
}

const HIYORI_MOTION_DESCRIPTIONS: Record<MotionId, string> = {
  wave: '挥手打招呼',
  nod: '点头',
  think: '思考',
  gesture: '手势解释',
  clap: '鼓掌',
  point: '指向',
  write: '书写动作',
  surprised: '惊讶',
}

const EXPRESSION_DESCRIPTIONS: Record<ExpressionId, string> = {
  happy: '开心',
  neutral: '中性',
  curious: '好奇',
  surprised: '惊讶',
  encouraging: '鼓励',
  thoughtful: '沉思',
}

/**
 * Default MotionRegistry for the Hiyori Live2D model.
 *
 * Expressions pass through as-is because Hiyori has no .exp3.json files —
 * expressions are implemented as parameter presets in the Live2D provider.
 */
export const HIYORI_MOTION_REGISTRY: MotionRegistry = {
  characterId: 'hiyori',

  getMotion(semanticId: MotionId): string {
    return HIYORI_MOTION_MAP[semanticId] ?? 'Idle_0'
  },

  getExpression(semanticId: ExpressionId): string {
    // Hiyori expressions are parameter presets, not .exp3.json files
    // The semantic ID is used directly as the preset key
    return semanticId
  },

  getAvailableMotions(): MotionMapping[] {
    return AVAILABLE_MOTIONS.map((id) => ({
      semanticId: id,
      modelMotionKey: HIYORI_MOTION_MAP[id],
      description: HIYORI_MOTION_DESCRIPTIONS[id],
    }))
  },

  getAvailableExpressions(): ExpressionMapping[] {
    return AVAILABLE_EXPRESSIONS.map((id) => ({
      semanticId: id,
      description: EXPRESSION_DESCRIPTIONS[id],
    }))
  },
}
