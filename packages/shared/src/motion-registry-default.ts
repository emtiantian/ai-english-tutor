import { AVAILABLE_MOTIONS, AVAILABLE_EXPRESSIONS } from './types.js'
import type { MotionId, ExpressionId } from './types.js'
import type { MotionRegistry, MotionMapping, ExpressionMapping } from './motion-registry.js'

/**
 * Hiyori 模型动作映射
 *
 * 将语义动作 ID 映射到 Hiyori Live2D 模型的 Idle 组下标。
 * 该模型有 9 个 Idle 动作（m01-m03、m05-m10）和 1 个 TapBody 动作（m04）。
 * 我们把 8 个语义 ID 映射到 Idle_0 至 Idle_7。
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
 * Hiyori Live2D 模型的默认 MotionRegistry。
 *
 * 表情直接透传，因为 Hiyori 没有 .exp3.json 文件 ——
 * 表情在 Live2D Provider 中通过参数预设实现。
 */
export const HIYORI_MOTION_REGISTRY: MotionRegistry = {
  characterId: 'hiyori',

  getMotion(semanticId: MotionId): string {
    return HIYORI_MOTION_MAP[semanticId] ?? 'Idle_0'
  },

  getExpression(semanticId: ExpressionId): string {
    // Hiyori 的表情是参数预设，而非 .exp3.json 文件
    // 语义 ID 直接用作预设 key
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
