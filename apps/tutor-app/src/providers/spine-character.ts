import type { CharacterProvider, CharacterState, MotionRegistry } from '@ai-english-tutor/shared'
import type { SpineModelConfig } from '../types/spine'
import { useSpineRenderer } from '../composables/useSpineRenderer'

/**
 * Spine 骨骼动画角色 Provider
 *
 * 实现 CharacterProvider 接口，使用 spine-webgl 运行时渲染 2D 骨骼动画。
 *
 * 支持：
 * - 动作动画播放（通过 AnimationState）
 * - 皮肤/表情切换（通过 Skeleton.setSkin）
 * - 口型同步（通过控制嘴巴骨骼 scaleY）
 * - 点击互动（通过 bounding box 碰撞检测）
 * - 窗口 resize 自适应
 * - 运行时切换动作注册表（setRegistry）
 */
export class SpineCharacterProvider implements CharacterProvider {
  private renderer = useSpineRenderer()
  private state: CharacterState = {
    currentMotion: null,
    currentExpression: null,
    mouthOpen: 0
  }

  /** 口型同步目标值（平滑插值用） */
  private targetMouthOpen = 0
  /** 口型同步当前值 */
  private currentMouthOpen = 0
  /** 口型同步平滑系数（越大越跟手，越小越平滑） */
  private mouthSmoothFactor = 0.15
  /** 口型同步动画帧 ID */
  private mouthAnimFrameId = 0

  /** 点击身体回调 */
  private _onTapBody?: () => void
  /** 窗口 resize 处理器引用（用于清理） */
  private _resizeHandler?: () => void

  /** MotionRegistry — 支持运行时切换动作映射 */
  private _registry?: MotionRegistry

  constructor(private config: SpineModelConfig) {}

  async init(canvas: HTMLCanvasElement): Promise<void> {
    await this.renderer.init(canvas, this.config)

    // 绑定鼠标事件（点击互动）
    this.bindMouseEvents(canvas)

    // 监听窗口大小变化
    this._resizeHandler = () => this.renderer.resize()
    window.addEventListener('resize', this._resizeHandler)

    // 启动口型同步平滑循环
    this.startMouthSyncLoop()
  }

  /** 绑定鼠标点击事件 */
  private bindMouseEvents(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('click', e => {
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      if (this.renderer.hitTest(x, y)) {
        console.log('[Spine] Body tapped!')
        this._onTapBody?.()
      }
    })
  }

  /** 设置点击身体回调（实现 CharacterProvider.onTapBody） */
  onTapBody(callback: () => void): void {
    this._onTapBody = callback
  }

  /** 运行时切换动作注册表（实现 CharacterProvider.setRegistry） */
  setRegistry(registry: MotionRegistry): void {
    this._registry = registry
    console.log('[Spine] MotionRegistry switched to:', registry.characterId)
  }

  async playMotion(motionId: string): Promise<void> {
    this.state.currentMotion = motionId
    const resolvedId = this._registry?.getMotion(motionId as any) ?? motionId
    this.playAnimation(resolvedId)
  }

  setExpression(exprId: string): void {
    this.state.currentExpression = exprId
    const resolvedId = this._registry?.getExpression(exprId as any) ?? exprId
    this.renderer.setSkin(resolvedId)
  }

  setMouthOpen(value: number): void {
    this.targetMouthOpen = Math.max(0, Math.min(1, value))
    this.state.mouthOpen = this.targetMouthOpen
  }

  getState(): CharacterState {
    return { ...this.state }
  }

  dispose(): void {
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler)
    }
    if (this.mouthAnimFrameId) cancelAnimationFrame(this.mouthAnimFrameId)
    this.renderer.dispose()
  }

  // --- 内部方法 ---

  private playAnimation(name: string): void {
    this.renderer.playAnimation(name, true)
  }

  /**
   * 口型同步平滑循环
   * 将 targetMouthOpen 平滑插值到 currentMouthOpen，
   * 然后映射到 Spine 骨骼参数
   */
  private startMouthSyncLoop(): void {
    const loop = () => {
      // 指数平滑：current = current + (target - current) * factor
      this.currentMouthOpen +=
        (this.targetMouthOpen - this.currentMouthOpen) * this.mouthSmoothFactor

      // 映射到 Spine 骨骼
      this.applyMouthSync(this.currentMouthOpen)

      this.mouthAnimFrameId = requestAnimationFrame(loop)
    }
    this.mouthAnimFrameId = requestAnimationFrame(loop)
  }

  /**
   * 将 mouthOpen (0-1) 映射到 Spine 骨骼参数
   */
  private applyMouthSync(mouthOpen: number): void {
    const boneName = this.config.mouthBoneName
    if (!boneName) return

    const control = this.config.mouthControl ?? 'scaleY'
    const min = this.config.mouthMinValue ?? 0.8
    const max = this.config.mouthMaxValue ?? 1.1

    // 线性映射：0 → min, 1 → max
    const value = min + (max - min) * mouthOpen

    if (control === 'scaleY') {
      // 保持 x 不变，只改 y
      const bone = this.renderer.findBone(boneName)
      if (bone) {
        this.renderer.setBoneScale(boneName, bone.scaleX, value)
      }
    } else {
      this.renderer.setBoneRotation(boneName, value)
    }
  }
}
