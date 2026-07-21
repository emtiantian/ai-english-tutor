/**
 * Hiyori Live2D 模型 manifest
 *
 * 模型素材位于 apps/tutor-app/public/models/hiyori/(Live2D Cubism Sample)。
 * Hiyori 没有 .exp3.json,所以 hasExpressions=false,通过 expressionParamPresets 模拟。
 */

import { AVAILABLE_MOTIONS, AVAILABLE_EXPRESSIONS } from '../../types.js'
import type { MotionId, ExpressionId } from '../../types.js'
import type { MotionRegistry, MotionMapping, ExpressionMapping } from '../../motion-registry.js'
import type { ExpressionParamPreset } from '../types.js'
import { defineLive2DModelManifest } from '../define-manifest.js'

/**
 * Hiyori 表情参数预设。
 *
 * 来源:apps/tutor-app/src/providers/live2d-character.ts(A 阶段重构前的本地常量)。
 * 抽到 manifest 后,Provider 改为读 manifest.expressionParamPresets。
 */
const HIYORI_EXPRESSION_PRESETS: Record<string, ExpressionParamPreset> = {
  happy: {
    ParamBrowLY: -0.3,
    ParamBrowRY: -0.3,
    ParamMouthForm: 1.0,
    ParamCheek: 0.6,
    ParamEyeLSmile: 1.0,
    ParamEyeRSmile: 1.0
  },
  neutral: {
    ParamBrowLY: 0,
    ParamBrowRY: 0,
    ParamMouthForm: 0,
    ParamCheek: 0,
    ParamEyeLSmile: 0,
    ParamEyeRSmile: 0
  },
  curious: {
    ParamBrowLY: -0.2,
    ParamBrowRY: -0.5,
    ParamBrowLAngle: 0.2,
    ParamBrowRAngle: -0.2,
    ParamMouthForm: 0.3,
    ParamAngleZ: -5
  },
  surprised: {
    ParamBrowLY: -1.0,
    ParamBrowRY: -1.0,
    ParamEyeLOpen: 1.5,
    ParamEyeROpen: 1.5,
    ParamMouthForm: 0.5
  },
  encouraging: {
    ParamBrowLY: -0.4,
    ParamBrowRY: -0.4,
    ParamMouthForm: 1.0,
    ParamCheek: 0.5,
    ParamEyeLSmile: 1.0,
    ParamEyeRSmile: 1.0
  },
  thoughtful: {
    ParamBrowLY: 0.2,
    ParamBrowRY: 0.2,
    ParamBrowLAngle: 0.3,
    ParamBrowRAngle: 0.3,
    ParamMouthForm: 0.2,
    ParamAngleX: 3,
    ParamAngleY: -2
  },
  sad: {
    ParamBrowLY: 0.3,
    ParamBrowRY: 0.3,
    ParamBrowLAngle: -0.2,
    ParamBrowRAngle: -0.2,
    ParamMouthForm: -0.3,
    ParamEyeLOpen: 0.7,
    ParamEyeROpen: 0.7
  }
}

/**
 * Hiyori 动作映射
 *
 * 将语义动作 ID 映射到 Hiyori Live2D 模型的 Idle 组下标。
 * 该模型有 9 个 Idle 动作(m01-m03、m05-m10)和 1 个 TapBody 动作(m04)。
 * 我们把 8 个语义 ID 映射到 Idle_0 至 Idle_7。
 */
const HIYORI_MOTION_MAP: Record<MotionId, string> = {
  wave: 'Idle_0', // Hiyori_m01 — 挥手
  nod: 'Idle_1', // Hiyori_m02 — 点头
  think: 'Idle_2', // Hiyori_m03 — 思考
  gesture: 'Idle_3', // Hiyori_m05 — 手势
  clap: 'Idle_4', // Hiyori_m06 — 鼓掌
  point: 'Idle_5', // Hiyori_m07 — 指向
  write: 'Idle_6', // Hiyori_m08 — 书写
  surprised: 'Idle_7' // Hiyori_m09 — 惊讶
}

const HIYORI_MOTION_DESCRIPTIONS: Record<MotionId, string> = {
  wave: '挥手打招呼',
  nod: '点头',
  think: '思考',
  gesture: '手势解释',
  clap: '鼓掌',
  point: '指向',
  write: '书写动作',
  surprised: '惊讶'
}

const HIYORI_EXPRESSION_DESCRIPTIONS: Record<ExpressionId, string> = {
  happy: '开心',
  neutral: '中性',
  curious: '好奇',
  surprised: '惊讶',
  encouraging: '鼓励',
  thoughtful: '沉思'
}

/**
 * Hiyori Live2D 模型的 MotionRegistry。
 *
 * 表情直接透传,因为 Hiyori 没有 .exp3.json 文件——
 * 表情在 Live2D Provider 中通过参数预设实现。
 */
const HIYORI_MOTION_REGISTRY: MotionRegistry = {
  characterId: 'hiyori',

  getMotion(semanticId: MotionId): string {
    return HIYORI_MOTION_MAP[semanticId] ?? 'Idle_0'
  },

  getExpression(semanticId: ExpressionId): string {
    // Hiyori 的表情是参数预设,而非 .exp3.json 文件
    // 语义 ID 直接用作预设 key
    return semanticId
  },

  getAvailableMotions(): MotionMapping[] {
    return AVAILABLE_MOTIONS.map(id => ({
      semanticId: id,
      modelMotionKey: HIYORI_MOTION_MAP[id],
      description: HIYORI_MOTION_DESCRIPTIONS[id]
    }))
  },

  getAvailableExpressions(): ExpressionMapping[] {
    return AVAILABLE_EXPRESSIONS.map(id => ({
      semanticId: id,
      description: HIYORI_EXPRESSION_DESCRIPTIONS[id]
    }))
  }
}

export const HIYORI_MANIFEST = defineLive2DModelManifest({
  id: 'hiyori',
  displayName: 'Hiyori',
  type: 'live2d',
  hasExpressions: false,
  expressionParamPresets: HIYORI_EXPRESSION_PRESETS,
  view: {
    scale: 1.0,
    offsetX: 0,
    offsetY: 0
  },
  motionRegistry: HIYORI_MOTION_REGISTRY,
  credit: {
    author: 'Live2D Inc.',
    license: 'Live2D Free Material License Agreement',
    licenseUrl: 'https://www.live2d.com/eula/live2d-sample-model-terms_en.html',
    sourceUrl: 'https://www.live2d.com/download/sample-data/'
  }
})
