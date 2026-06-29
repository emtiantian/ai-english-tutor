/**
 * Live2D / VRM 模型清单类型
 *
 * 把"模型素材路径 + 渲染参数 + 表情/动作映射 + 出处协议"打包成一个 manifest,
 * 解耦 Provider 实现与具体模型。Provider 只读 manifest,不再硬编码任何路径。
 *
 * 后续多老师角色卡(`TeacherProfile.characterModel`)直接复用此 manifest。
 */

import type { MotionRegistry } from '../motion-registry.js'

/** 模型出处与许可声明,UI 内显示 */
export interface ModelCredit {
  /** 作者 / 版权所有者,如 'Live2D Inc.' */
  author: string
  /** 许可证名称,如 'Live2D Free Material License Agreement' */
  license: string
  /** 许可证链接 */
  licenseUrl: string
  /** 素材来源仓库或网站,可选 */
  sourceUrl?: string
}

/**
 * Live2D 模型在 canvas 内的渲染参数。
 *
 * 不同模型画风/尺寸差异大(shizuku 偏写实大幅、mao_pro 偏 chibi 小幅),
 * 需要逐个模型手动调一组合适的 scale/offset。
 */
export interface Live2DModelView {
  /** 额外缩放系数(乘到 resize 计算结果上),1 = 不变 */
  scale: number
  /** X 方向额外平移(像素,以 canvas 逻辑像素为准),0 = 不变 */
  offsetX: number
  /** Y 方向额外平移(像素,以 canvas 逻辑像素为准),正值 = 向下 */
  offsetY: number
}

/**
 * Cubism 参数键 → 数值 的预设。
 *
 * 当模型没有 .exp3.json(如 hiyori)时,用参数预设模拟表情。
 * 当模型自带 .exp3.json(如 shizuku/mao_pro)时,可以留空,Provider 走 .exp3.json 加载路径。
 */
export type ExpressionParamPreset = Record<string, number>

/**
 * Live2D 模型清单
 */
export interface Live2DModelManifest {
  /** 唯一 ID,小写 + 下划线/连字符,如 'hiyori' / 'shizuku' / 'mao_pro' */
  id: string
  /** UI 显示名称,如 'Hiyori' / 'Shizuku' */
  displayName: string
  /** 渲染类型,固定 'live2d' */
  type: 'live2d'
  /** .model3.json 的 public 相对路径,如 '/models/hiyori/Hiyori.model3.json' */
  modelJsonPath: string
  /** 该模型是否自带 .exp3.json 表情文件 */
  hasExpressions: boolean
  /**
   * 表情参数预设。
   * - hasExpressions=false 时,Provider 用这里的预设模拟表情(必填)
   * - hasExpressions=true 时,这里可以是 undefined 或仅留 fallback 的几个表情
   */
  expressionParamPresets?: Record<string, ExpressionParamPreset>
  /** Canvas 内的渲染参数(每个模型独立调) */
  view: Live2DModelView
  /** 语义动作/表情 ID → 模型内部 key 的映射 */
  motionRegistry: MotionRegistry
  /** 出处与许可证 */
  credit: ModelCredit
}

/**
 * VRM 模型清单(预留,A 阶段不实现 —— 见 doc/live2d-素材集成计划.md §8)
 *
 * 当未来引入 VRM 时,这个类型会被填充。当前只占位,确保联合类型可扩展。
 */
export interface VRMModelManifest {
  id: string
  displayName: string
  type: 'vrm'
  /** TODO(VRM): 实际字段在引入 VRM 时定义 */
  vrmPath: string
  credit: ModelCredit
}

/** 所有支持的角色模型类型(联合) */
export type CharacterModelManifest = Live2DModelManifest | VRMModelManifest
