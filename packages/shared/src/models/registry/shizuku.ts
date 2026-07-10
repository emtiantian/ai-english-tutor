/**
 * Shizuku Live2D 模型 manifest
 *
 * 模型素材位于 apps/tutor-app/public/models/shizuku/(来自 Open-LLM-VTuber,Live2D Inc. 官方 sample)。
 *
 * Shizuku 没有 .exp3.json,需要用 expressionParamPresets 模拟表情。
 * 参数命名是 Cubism 2.1 风格的 PARAM_* 大写下划线(SDK 4 仍向后兼容)。
 *
 * Motion 只有 4 组(Idle / Tap / FlickUp / Flick3),少于我们的 8 个语义 motion,
 * 大量映射到 Idle_0 作 fallback —— motion-analyzer 的兜底逻辑也能处理。
 */

import { AVAILABLE_MOTIONS, AVAILABLE_EXPRESSIONS } from '../../types.js'
import type { MotionId, ExpressionId } from '../../types.js'
import type { MotionRegistry, MotionMapping, ExpressionMapping } from '../../motion-registry.js'
import type { ExpressionParamPreset } from '../types.js'
import { defineLive2DModelManifest } from '../define-manifest.js'

/**
 * Shizuku motion 映射。
 *
 * model3.json 里 4 组都只有 1 个文件,所以 key 是 `<Group>_0`:
 * - `Idle_0` ← motion/04.motion3.json(idle / 站姿微动)
 * - `Tap_0` ← motion/02.motion3.json(点击身体反应)
 * - `FlickUp_0` ← motion/01.motion3.json(向上甩头/手)
 * - `Flick3_0` ← motion/03.motion3.json(三连甩,有手势感)
 *
 * 没有专门的 nod/clap/write 动作,统一兜底到最接近的 motion。
 */
const SHIZUKU_MOTION_MAP: Record<MotionId, string> = {
  wave: 'FlickUp_0',     // 向上甩 ≈ 挥手起势
  nod: 'Idle_0',         // 无专门点头 → idle 兜底
  think: 'Idle_0',       // idle 兜底
  gesture: 'Flick3_0',   // 三连甩有手势感
  clap: 'Tap_0',         // Tap 反应动作 ≈ 鼓掌反应
  point: 'Flick3_0',     // 三连 ≈ 指向
  write: 'Idle_0',       // idle 兜底
  surprised: 'Tap_0',    // Tap 是反应,接近惊讶
}

const SHIZUKU_MOTION_DESCRIPTIONS: Record<MotionId, string> = {
  wave: 'FlickUp - 向上甩(挥手起势)',
  nod: 'Idle 兜底(无专门点头)',
  think: 'Idle 兜底(无专门思考)',
  gesture: 'Flick3 - 三连甩(手势感)',
  clap: 'Tap - 点击身体反应',
  point: 'Flick3 - 三连甩(指向感)',
  write: 'Idle 兜底(无书写)',
  surprised: 'Tap - 反应动作(接近惊讶)',
}

const SHIZUKU_EXPRESSION_DESCRIPTIONS: Record<ExpressionId, string> = {
  happy: '开心',
  neutral: '中性',
  curious: '好奇',
  surprised: '惊讶',
  encouraging: '鼓励',
  thoughtful: '沉思',
}

/**
 * Shizuku 的 MotionRegistry 实现。
 * Provider 调 getMotion 拿到模型 key,setExpression 直接用语义 ID 当 preset key。
 */
const SHIZUKU_MOTION_REGISTRY: MotionRegistry = {
  characterId: 'shizuku',

  getMotion(semanticId: MotionId): string {
    return SHIZUKU_MOTION_MAP[semanticId] ?? 'Idle_0'
  },

  getExpression(semanticId: ExpressionId): string {
    return semanticId
  },

  getAvailableMotions(): MotionMapping[] {
    return AVAILABLE_MOTIONS.map((id) => ({
      semanticId: id,
      modelMotionKey: SHIZUKU_MOTION_MAP[id],
      description: SHIZUKU_MOTION_DESCRIPTIONS[id],
    }))
  },

  getAvailableExpressions(): ExpressionMapping[] {
    return AVAILABLE_EXPRESSIONS.map((id) => ({
      semanticId: id,
      description: SHIZUKU_EXPRESSION_DESCRIPTIONS[id],
    }))
  },
}

/**
 * Shizuku 表情参数预设(Cubism 2.1 风格的 PARAM_* 命名)。
 *
 * 关键参数(出处:public/models/shizuku/shizuku.cdi3.json):
 * - PARAM_BROW_L_Y / PARAM_BROW_R_Y    眉毛上下(负值上提=惊/喜,正值下垂=愁)
 * - PARAM_BROW_L_ANGLE / R_ANGLE       眉毛角度(正值外八=愁,负值内八=怒/疑)
 * - PARAM_BROW_L_FORM / R_FORM         眉毛形状变形
 * - PARAM_MOUTH_FORM                   嘴形(1=笑,-1=愁,0=中性)
 * - PARAM_MOUTH_OPEN_Y                 嘴开合(惊讶时张开)
 * - PARAM_EYE_L_OPEN / R_OPEN          眼开合(1=普通,>1=瞪大,<1=眯眼)
 * - PARAM_TERE                         害羞/脸颊染红(等价于其他模型的 ParamCheek)
 * - PARAM_ANGLE_X/Y/Z                  头部倾斜
 *
 * 注意:shizuku 没有 PARAM_EYE_L_SMILE / R_SMILE,无法做"笑眼"效果,
 * 通过 PARAM_EYE_OPEN<1 + PARAM_MOUTH_FORM=1 模拟整体微笑。
 */
const SHIZUKU_EXPRESSION_PRESETS: Record<string, ExpressionParamPreset> = {
  happy: {
    PARAM_BROW_L_Y: -0.3,
    PARAM_BROW_R_Y: -0.3,
    PARAM_MOUTH_FORM: 1.0,
    PARAM_TERE: 0.6,
    PARAM_EYE_L_OPEN: 0.7,    // 眯起一点 ≈ 笑眼效果
    PARAM_EYE_R_OPEN: 0.7,
  },
  neutral: {
    PARAM_BROW_L_Y: 0,
    PARAM_BROW_R_Y: 0,
    PARAM_BROW_L_ANGLE: 0,
    PARAM_BROW_R_ANGLE: 0,
    PARAM_MOUTH_FORM: 0,
    PARAM_TERE: 0,
    PARAM_EYE_L_OPEN: 1.0,
    PARAM_EYE_R_OPEN: 1.0,
  },
  curious: {
    PARAM_BROW_L_Y: -0.2,
    PARAM_BROW_R_Y: -0.5,        // 单边挑眉
    PARAM_BROW_L_FORM: 0.3,
    PARAM_MOUTH_FORM: 0.3,
    PARAM_ANGLE_Z: -5,           // 头部微倾
  },
  surprised: {
    PARAM_BROW_L_Y: -1.0,
    PARAM_BROW_R_Y: -1.0,
    PARAM_EYE_L_OPEN: 1.4,
    PARAM_EYE_R_OPEN: 1.4,
    PARAM_MOUTH_FORM: 0.5,
    PARAM_MOUTH_OPEN_Y: 0.8,
  },
  encouraging: {
    PARAM_BROW_L_Y: -0.4,
    PARAM_BROW_R_Y: -0.4,
    PARAM_MOUTH_FORM: 1.0,
    PARAM_TERE: 0.5,
    PARAM_EYE_L_OPEN: 0.8,
    PARAM_EYE_R_OPEN: 0.8,
  },
  thoughtful: {
    PARAM_BROW_L_Y: 0.2,
    PARAM_BROW_R_Y: 0.2,
    PARAM_BROW_L_ANGLE: 0.3,
    PARAM_BROW_R_ANGLE: 0.3,
    PARAM_MOUTH_FORM: 0.2,
    PARAM_ANGLE_X: 3,
    PARAM_ANGLE_Y: -2,
  },
  sad: {
    PARAM_BROW_L_Y: 0.3,
    PARAM_BROW_R_Y: 0.3,
    PARAM_BROW_L_ANGLE: -0.3,
    PARAM_BROW_R_ANGLE: -0.3,
    PARAM_MOUTH_FORM: -0.5,
    PARAM_EYE_L_OPEN: 0.7,
    PARAM_EYE_R_OPEN: 0.7,
  },
}

export const SHIZUKU_MANIFEST = defineLive2DModelManifest({
  id: 'shizuku',
  displayName: 'Shizuku',
  type: 'live2d',
  hasExpressions: false,
  expressionParamPresets: SHIZUKU_EXPRESSION_PRESETS,
  view: {
    // shizuku 画风较大幅,默认稍微缩一点。D 阶段联调时调整。
    scale: 0.85,
    offsetX: 0,
    offsetY: 0,
  },
  motionRegistry: SHIZUKU_MOTION_REGISTRY,
  credit: {
    author: 'Live2D Inc.',
    license: 'Live2D Free Material License Agreement',
    licenseUrl: 'https://www.live2d.com/eula/live2d-sample-model-terms_en.html',
    sourceUrl: 'https://github.com/Open-LLM-VTuber/Open-LLM-VTuber/tree/main/live2d-models/shizuku',
  },
})
