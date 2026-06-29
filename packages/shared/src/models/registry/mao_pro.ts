/**
 * Mao Pro Live2D 模型 manifest
 *
 * 模型素材位于 apps/tutor-app/public/models/mao_pro/(来自 Open-LLM-VTuber,Live2D Inc. 官方 sample)。
 *
 * Mao Pro 自带 8 个 .exp3.json(exp_01..exp_08),理论上 hasExpressions=true,
 * 但当前 Provider 只支持参数预设路径,所以 C 阶段仍走 expressionParamPresets,
 * 表情通过 ParamMouthUp / ParamCheek / ParamEyeLSmile 等参数模拟。
 * 未来如果加上 .exp3.json 加载逻辑,这里改 hasExpressions=true + 删 presets 即可。
 *
 * Motion 一共 7 个,但只有 1 个 Idle 是命名组,其余 6 个全在空字符串组里 ——
 * Provider 加载时按 `${groupName}_${index}` 生成 key,所以空组的 key 是 `_0` ~ `_5`。
 */

import { AVAILABLE_MOTIONS, AVAILABLE_EXPRESSIONS } from '../../types.js'
import type { MotionId, ExpressionId } from '../../types.js'
import type { MotionRegistry, MotionMapping, ExpressionMapping } from '../../motion-registry.js'
import type { Live2DModelManifest, ExpressionParamPreset } from '../types.js'

/**
 * Mao Pro motion 映射。
 *
 * model3.json 的 motion 顺序(空组 "" 按数组下标对应 key):
 * - `Idle_0` ← motions/mtn_01.motion3.json(idle / 站姿微动)
 * - `_0` ← motions/mtn_02.motion3.json(basic motion 2)
 * - `_1` ← motions/mtn_03.motion3.json(basic motion 3)
 * - `_2` ← motions/mtn_04.motion3.json(basic motion 4)
 * - `_3` ← motions/special_01.motion3.json(special)
 * - `_4` ← motions/special_02.motion3.json(special)
 * - `_5` ← motions/special_03.motion3.json(special)
 *
 * Special 系列通常更夸张(适合 wave/surprised),mtn 系列适合一般手势。
 * 具体动作语义需在 D 阶段联调时看动画确认,这里给一个合理的初始映射。
 */
const MAO_PRO_MOTION_MAP: Record<MotionId, string> = {
  wave: '_3',           // special_01,夸张动作适合打招呼
  nod: '_0',            // mtn_02,基础动作
  think: '_1',          // mtn_03
  gesture: '_2',        // mtn_04
  clap: '_4',           // special_02
  point: '_5',          // special_03
  write: 'Idle_0',      // 没有专门的书写动作 → idle 兜底
  surprised: '_3',      // special_01
}

const MAO_PRO_MOTION_DESCRIPTIONS: Record<MotionId, string> = {
  wave: 'special_01 - 夸张打招呼',
  nod: 'mtn_02 - 基础动作',
  think: 'mtn_03 - 基础动作',
  gesture: 'mtn_04 - 基础动作',
  clap: 'special_02 - 特殊动作',
  point: 'special_03 - 特殊动作',
  write: 'Idle 兜底(无书写)',
  surprised: 'special_01 - 夸张反应',
}

const MAO_PRO_EXPRESSION_DESCRIPTIONS: Record<ExpressionId, string> = {
  happy: '开心',
  neutral: '中性',
  curious: '好奇',
  surprised: '惊讶',
  encouraging: '鼓励',
  thoughtful: '沉思',
}

const MAO_PRO_MOTION_REGISTRY: MotionRegistry = {
  characterId: 'mao_pro',

  getMotion(semanticId: MotionId): string {
    return MAO_PRO_MOTION_MAP[semanticId] ?? 'Idle_0'
  },

  getExpression(semanticId: ExpressionId): string {
    return semanticId
  },

  getAvailableMotions(): MotionMapping[] {
    return AVAILABLE_MOTIONS.map((id) => ({
      semanticId: id,
      modelMotionKey: MAO_PRO_MOTION_MAP[id],
      description: MAO_PRO_MOTION_DESCRIPTIONS[id],
    }))
  },

  getAvailableExpressions(): ExpressionMapping[] {
    return AVAILABLE_EXPRESSIONS.map((id) => ({
      semanticId: id,
      description: MAO_PRO_EXPRESSION_DESCRIPTIONS[id],
    }))
  },
}

/**
 * Mao Pro 表情参数预设(Cubism 4 风格的 Param* 命名,与 hiyori 类似但嘴形参数不同)。
 *
 * 关键差异:mao_pro 没有 ParamMouthForm,改用:
 * - ParamMouthUp     微笑(正值上扬)
 * - ParamMouthDown   难过(正值下垂)
 * - ParamMouthAngry  生气(正值)
 *
 * 其他参数(出处:public/models/mao_pro/mao_pro.cdi3.json):
 * - ParamBrowLY / RY                眉毛上下
 * - ParamBrowLAngle / RAngle        眉毛角度
 * - ParamCheek                      脸颊染红
 * - ParamEyeLOpen / ROpen           眼开合
 * - ParamEyeLSmile / RSmile         笑眼
 * - ParamAngleX/Y/Z                 头部
 *
 * 未来引入 .exp3.json 加载后,这些 preset 可以删掉,改成 expressionMap:{happy:'exp_03',...}
 * 之类的映射;现在为保持 Provider 接口一致暂用 preset。
 */
const MAO_PRO_EXPRESSION_PRESETS: Record<string, ExpressionParamPreset> = {
  happy: {
    ParamMouthUp: 1.0,
    ParamCheek: 0.6,
    ParamEyeLSmile: 0.8,
    ParamEyeRSmile: 0.8,
    ParamBrowLY: -0.2,
    ParamBrowRY: -0.2,
  },
  neutral: {
    ParamMouthUp: 0,
    ParamMouthDown: 0,
    ParamMouthAngry: 0,
    ParamCheek: 0,
    ParamEyeLSmile: 0,
    ParamEyeRSmile: 0,
    ParamBrowLY: 0,
    ParamBrowRY: 0,
    ParamBrowLAngle: 0,
    ParamBrowRAngle: 0,
  },
  curious: {
    ParamBrowLY: -0.3,
    ParamBrowRY: -0.6,            // 单边挑眉
    ParamBrowLAngle: 0.2,
    ParamMouthUp: 0.3,
    ParamAngleZ: -3,
  },
  surprised: {
    ParamBrowLY: -1.0,
    ParamBrowRY: -1.0,
    ParamEyeLOpen: 1.3,
    ParamEyeROpen: 1.3,
    ParamMouthUp: 0.4,            // 微张
  },
  encouraging: {
    ParamMouthUp: 1.0,
    ParamCheek: 0.5,
    ParamEyeLSmile: 0.9,
    ParamEyeRSmile: 0.9,
    ParamBrowLY: -0.3,
    ParamBrowRY: -0.3,
  },
  thoughtful: {
    ParamBrowLY: 0.2,
    ParamBrowRY: 0.2,
    ParamBrowLAngle: 0.3,
    ParamBrowRAngle: 0.3,
    ParamMouthUp: 0.1,
    ParamAngleX: 3,
    ParamAngleY: -2,
  },
  sad: {
    ParamMouthDown: 0.6,
    ParamBrowLY: 0.3,
    ParamBrowRY: 0.3,
    ParamBrowLAngle: -0.2,
    ParamBrowRAngle: -0.2,
    ParamEyeLOpen: 0.7,
    ParamEyeROpen: 0.7,
  },
}

export const MAO_PRO_MANIFEST: Live2DModelManifest = {
  id: 'mao_pro',
  displayName: 'Mao Niziiro',
  type: 'live2d',
  modelJsonPath: '/models/mao_pro/mao_pro.model3.json',
  hasExpressions: false,                   // 先用 preset;TODO 后续支持 .exp3.json 加载
  expressionParamPresets: MAO_PRO_EXPRESSION_PRESETS,
  view: {
    // mao_pro 在模型坐标系里偏高(boundsH ~3.06),基础 scale 只有 0.59 左右,
    // 需要比 hiyori/shizuku 更大的 viewScale 才能在画布上看起来大小接近。
    scale: 1.6,
    offsetX: 0,
    offsetY: 100,
  },
  motionRegistry: MAO_PRO_MOTION_REGISTRY,
  credit: {
    author: 'Live2D Inc.',
    license: 'Live2D Free Material License Agreement',
    licenseUrl: 'https://www.live2d.com/eula/live2d-sample-model-terms_en.html',
    sourceUrl: 'https://github.com/Open-LLM-VTuber/Open-LLM-VTuber/tree/main/live2d-models/mao_pro',
  },
}
