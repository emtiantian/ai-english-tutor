/**
 * Hiyori Live2D 模型 manifest
 *
 * 模型素材位于 apps/tutor-app/public/models/hiyori/(Live2D Cubism Sample)。
 * Hiyori 没有 .exp3.json,所以 hasExpressions=false,通过 expressionParamPresets 模拟。
 *
 * Motion registry 直接复用 motion-registry-default.ts 的 HIYORI_MOTION_REGISTRY,
 * 保持后端(engine.ts / session-manager.ts)的现有导入路径不变。
 */

import { HIYORI_MOTION_REGISTRY } from '../../motion-registry-default.js'
import type { Live2DModelManifest, ExpressionParamPreset } from '../types.js'

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
    ParamEyeRSmile: 1.0,
  },
  neutral: {
    ParamBrowLY: 0,
    ParamBrowRY: 0,
    ParamMouthForm: 0,
    ParamCheek: 0,
    ParamEyeLSmile: 0,
    ParamEyeRSmile: 0,
  },
  curious: {
    ParamBrowLY: -0.2,
    ParamBrowRY: -0.5,
    ParamBrowLAngle: 0.2,
    ParamBrowRAngle: -0.2,
    ParamMouthForm: 0.3,
    ParamAngleZ: -5,
  },
  surprised: {
    ParamBrowLY: -1.0,
    ParamBrowRY: -1.0,
    ParamEyeLOpen: 1.5,
    ParamEyeROpen: 1.5,
    ParamMouthForm: 0.5,
  },
  encouraging: {
    ParamBrowLY: -0.4,
    ParamBrowRY: -0.4,
    ParamMouthForm: 1.0,
    ParamCheek: 0.5,
    ParamEyeLSmile: 1.0,
    ParamEyeRSmile: 1.0,
  },
  thoughtful: {
    ParamBrowLY: 0.2,
    ParamBrowRY: 0.2,
    ParamBrowLAngle: 0.3,
    ParamBrowRAngle: 0.3,
    ParamMouthForm: 0.2,
    ParamAngleX: 3,
    ParamAngleY: -2,
  },
  sad: {
    ParamBrowLY: 0.3,
    ParamBrowRY: 0.3,
    ParamBrowLAngle: -0.2,
    ParamBrowRAngle: -0.2,
    ParamMouthForm: -0.3,
    ParamEyeLOpen: 0.7,
    ParamEyeROpen: 0.7,
  },
}

export const HIYORI_MANIFEST: Live2DModelManifest = {
  id: 'hiyori',
  displayName: 'Hiyori',
  type: 'live2d',
  modelJsonPath: '/models/hiyori/Hiyori.model3.json',
  hasExpressions: false,
  expressionParamPresets: HIYORI_EXPRESSION_PRESETS,
  view: {
    scale: 1.0,
    offsetX: 0,
    offsetY: 0,
  },
  motionRegistry: HIYORI_MOTION_REGISTRY,
  credit: {
    author: 'Live2D Inc.',
    license: 'Live2D Free Material License Agreement',
    licenseUrl: 'https://www.live2d.com/eula/live2d-sample-model-terms_en.html',
    sourceUrl: 'https://www.live2d.com/download/sample-data/',
  },
}
