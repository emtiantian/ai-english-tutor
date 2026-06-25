import type { CharacterState } from '../types.js'
import type { MotionRegistry } from '../motion-registry.js'

export interface CharacterProvider {
  /** 初始化角色渲染到指定的 canvas 上 */
  init(canvas: HTMLCanvasElement): Promise<void>

  /** 播放某个动作动画 */
  playMotion(motionId: string): Promise<void>

  /** 设置表情 */
  setExpression(exprId: string): void

  /** 口型同步：控制嘴巴张开程度 (0-1) */
  setMouthOpen(value: number): void

  /** 获取当前角色状态 */
  getState(): CharacterState

  /** 销毁释放资源 */
  dispose(): void

  /**
   * 设置动作注册表（可选）
   * 支持运行时切换角色的动作映射，不实现则使用默认注册表
   */
  setRegistry?(registry: MotionRegistry): void

  /**
   * 点击角色身体时的回调（可选）
   * 用于互动功能（如点击触发对话）
   */
  onTapBody?(callback: () => void): void

  /**
   * 设置情绪表情，支持平滑融合（可选）
   */
  setEmotion?(emotionId: string, intensity?: number): void

  /**
   * 通知角色开始/结束说话（可选）
   * 可用于触发点头、口型同步等
   */
  setSpeaking?(isSpeaking: boolean): void

  /**
   * 通知角色进入/退出倾听状态（可选）
   * 可用于调整眼神和姿态
   */
  setListening?(isListening: boolean): void

  /**
   * 通知角色进入/退出思考状态（可选）
   */
  setThinking?(isThinking: boolean): void

  /**
   * 通知角色发生错误（可选）
   */
  onError?(): void
}
