import {
  AVAILABLE_EXPRESSIONS,
  AVAILABLE_MOTIONS,
  type ExpressionId,
  type MotionId,
} from './types'
import type { MotionRegistry, MotionMapping, ExpressionMapping } from './motion-registry'

export interface MotionRegistryJson {
  characterId: string
  motions: Partial<Record<MotionId, string>>
  expressions: Partial<Record<ExpressionId, string>>
  motionDescriptions?: Partial<Record<MotionId, string>>
  expressionDescriptions?: Partial<Record<ExpressionId, string>>
}

export interface MotionConfig {
  enabled?: MotionId[]
  descriptions?: Partial<Record<MotionId, string>>
}

export interface ExpressionConfig {
  enabled?: ExpressionId[]
  descriptions?: Partial<Record<ExpressionId, string>>
}

export function motionRegistryFromJson(json: MotionRegistryJson): MotionRegistry {
  const motionDesc = json.motionDescriptions ?? {}
  const expressionDesc = json.expressionDescriptions ?? {}

  return {
    characterId: json.characterId,

    getMotion(semanticId: MotionId): string {
      return json.motions[semanticId] ?? 'Idle_0'
    },

    getExpression(semanticId: ExpressionId): string {
      return json.expressions[semanticId] ?? semanticId
    },

    getAvailableMotions(): MotionMapping[] {
      return AVAILABLE_MOTIONS
        .filter((id) => id in json.motions)
        .map((id) => ({
          semanticId: id,
          modelMotionKey: json.motions[id]!,
          description: motionDesc[id] ?? `Perform the ${id} motion`,
        }))
    },

    getAvailableExpressions(): ExpressionMapping[] {
      return AVAILABLE_EXPRESSIONS
        .filter((id) => id in json.expressions)
        .map((id) => ({
          semanticId: id,
          description: expressionDesc[id] ?? `${id} expression`,
        }))
    },
  }
}

export function buildMotionPromptBlock(
  registry: MotionRegistry,
  config?: MotionConfig,
): string {
  const all = registry.getAvailableMotions()
  const enabledIds = config?.enabled ?? all.map((m) => m.semanticId)
  const descriptions = config?.descriptions ?? {}

  const enabled = enabledIds
    .map((id) => all.find((m) => m.semanticId === id))
    .filter((m): m is MotionMapping => m !== undefined)

  if (enabled.length === 0) {
    return ''
  }

  const lines = enabled.map((m, index) => {
    const desc = descriptions[m.semanticId] ?? m.description
    return `${index + 1}. ${m.semanticId}: ${desc}`
  })

  return `Available motions:\n${lines.join('\n')}\n\nChoose exactly one motionId from the list above for each response.`
}

export function buildExpressionPromptBlock(
  registry: MotionRegistry,
  config?: ExpressionConfig,
): string {
  const all = registry.getAvailableExpressions()
  const enabledIds = config?.enabled ?? all.map((e) => e.semanticId)
  const descriptions = config?.descriptions ?? {}

  const enabled = enabledIds
    .map((id) => all.find((e) => e.semanticId === id))
    .filter((e): e is ExpressionMapping => e !== undefined)

  if (enabled.length === 0) {
    return ''
  }

  const lines = enabled.map((e, index) => {
    const desc = descriptions[e.semanticId] ?? e.description
    return `${index + 1}. ${e.semanticId}: ${desc}`
  })

  return `Available expressions:\n${lines.join('\n')}\n\nChoose exactly one expressionId from the list above for each response.`
}
