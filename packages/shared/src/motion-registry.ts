import type { MotionId, ExpressionId } from './types.js'

/**
 * 将语义动作 ID 映射到模型专属的动作 key
 */
export interface MotionMapping {
  /** AI 引擎使用的语义 ID（如 'wave'） */
  semanticId: MotionId
  /** 模型专属 key（如 Hiyori 的 'Idle_0'、Spine 的 'wave'） */
  modelMotionKey: string
  /** 人类可读的描述，用于日志/调试 */
  description: string
}

/**
 * 将语义表情 ID 映射到模型专属的表情 key
 */
export interface ExpressionMapping {
  semanticId: ExpressionId
  description: string
}

/**
 * MotionRegistry —— 将语义动作/表情 ID 与模型专属实现解耦。
 *
 * 每个角色模型（Hiyori、Spine 等）提供自己的注册表，
 * 把规范的语义 ID 映射到模型实际的动作/表情 key。
 * 这让 AI 引擎和前端无需硬编码模型专属的动作文件名，
 * 即可适配任意角色模型。
 */
export interface MotionRegistry {
  /** 该角色动作集的唯一标识 */
  readonly characterId: string

  /**
   * 将语义动作 ID 映射到模型实际的动作 key。
   * 若语义 ID 未映射，则返回兜底 key。
   */
  getMotion(semanticId: MotionId): string

  /**
   * 将语义表情 ID 映射到模型实际的表情 key。
   * 若语义 ID 未映射，则返回兜底 key。
   */
  getExpression(semanticId: ExpressionId): string

  /** 列出所有可用的动作映射（用于 UI/调试） */
  getAvailableMotions(): MotionMapping[]

  /** 列出所有可用的表情映射（用于 UI/调试） */
  getAvailableExpressions(): ExpressionMapping[]
}
