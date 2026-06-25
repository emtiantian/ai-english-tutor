/**
 * Spine 角色模型配置
 */
export interface SpineModelConfig {
  /** 骨骼数据文件路径（.skel 或 .json） */
  skeletonPath: string
  /** 纹理图集配置路径（.atlas） */
  atlasPath: string
  /** 纹理图集图片路径（.png），省略时从 atlas 中解析 */
  texturePath?: string
  /** 动画名称映射：通用动作名 → Spine 动画名 */
  animationMap?: Record<string, string>
  /** 表情/皮肤名称映射：通用表情名 → Spine 皮肤名 */
  skinMap?: Record<string, string>
  /** 口型同步骨骼名（默认 'mouth'） */
  mouthBoneName?: string
  /** 口型同步控制方式：'scaleY' | 'rotation' */
  mouthControl?: 'scaleY' | 'rotation'
  /** 嘴巴张开最小值（对应闭嘴） */
  mouthMinValue?: number
  /** 嘴巴张开最大值（对应张嘴） */
  mouthMaxValue?: number
  /** 初始缩放比例 */
  scale?: number
  /** 初始位置偏移 [x, y] */
  offset?: [number, number]
  /** 是否预乘 alpha */
  premultipliedAlpha?: boolean
}

/**
 * Spine 渲染器状态
 */
export interface SpineRendererState {
  isLoading: boolean
  isReady: boolean
  currentAnimation: string | null
  currentSkin: string | null
  error: string | null
}
