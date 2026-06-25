import type { SpineModelConfig } from '../types/spine'

/**
 * Spineboy 示例角色配置
 * 使用 Spine 官方示例数据（spineboy）
 */
export const spineboyConfig: SpineModelConfig = {
  skeletonPath: '/models/spine/spineboy-4.3.skel',
  atlasPath: '/models/spine/spineboy-4.3.atlas',

  // 动画映射：通用动作名 → spineboy 动画名
  animationMap: {
    idle: 'idle',           // 待机
    walk: 'walk',           // 走路
    run: 'run',             // 跑步
    jump: 'jump',           // 跳跃
    greeting: 'idle',       // 打招呼（fallback 到 idle）
    talking: 'walk',        // 说话（fallback 到 walk，有肢体摆动）
    happy: 'jump',          // 开心
    sad: 'idle',            // 难过（fallback 到 idle）
    surprised: 'jump',      // 惊讶
    thinking: 'idle',       // 思考
  },

  // 皮肤映射：spineboy 没有多皮肤，留空
  skinMap: {},

  // 口型同步配置
  // spineboy 模型没有独立的 mouth 骨骼，
  // 因此口型同步会尝试查找 head 或类似的骨骼作为 fallback
  mouthBoneName: 'head',
  mouthControl: 'scaleY',
  mouthMinValue: 0.8,
  mouthMaxValue: 1.1,

  // 渲染配置（不设置 scale 则自动根据 canvas 尺寸计算）
  offset: [0, 0],
  premultipliedAlpha: true,
}

/**
 * 默认角色配置
 */
export const defaultSpineConfig = spineboyConfig
