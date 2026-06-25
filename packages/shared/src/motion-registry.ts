import type { MotionId, ExpressionId } from './types.js'

/**
 * Maps a semantic motion ID to a model-specific motion key
 */
export interface MotionMapping {
  /** Semantic ID used by the AI engine (e.g. 'wave') */
  semanticId: MotionId
  /** Model-specific key (e.g. 'Idle_0' for Hiyori, 'wave' for Spine) */
  modelMotionKey: string
  /** Human-readable description for logging/debugging */
  description: string
}

/**
 * Maps a semantic expression ID to a model-specific expression key
 */
export interface ExpressionMapping {
  semanticId: ExpressionId
  description: string
}

/**
 * MotionRegistry — decouples semantic motion/expression IDs from model-specific implementations.
 *
 * Each character model (Hiyori, Spine, etc.) provides its own registry that maps
 * the canonical semantic IDs to the model's actual motion/expression keys.
 * This allows the AI engine and frontend to work with any character model
 * without hardcoding model-specific motion file names.
 */
export interface MotionRegistry {
  /** Unique identifier for this character's motion set */
  readonly characterId: string

  /**
   * Map a semantic motion ID to the model's actual motion key.
   * Returns a fallback key if the semantic ID is not mapped.
   */
  getMotion(semanticId: MotionId): string

  /**
   * Map a semantic expression ID to the model's actual expression key.
   * Returns a fallback key if the semantic ID is not mapped.
   */
  getExpression(semanticId: ExpressionId): string

  /** List all available motion mappings (for UI/debugging) */
  getAvailableMotions(): MotionMapping[]

  /** List all available expression mappings (for UI/debugging) */
  getAvailableExpressions(): ExpressionMapping[]
}
