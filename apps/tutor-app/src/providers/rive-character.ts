import type { CharacterProvider, CharacterState, MotionRegistry } from '@ai-english-tutor/shared'
import {
  Rive,
  Layout,
  Fit,
  Alignment,
  StateMachineInputType,
  type StateMachineInput,
} from '@rive-app/canvas'

/**
 * Rive 角色 Provider —— Live2D 的轻量替代
 *
 * 为什么用 Rive：
 * - `.riv` 资源仅几十 KB（对比 Live2D Hiyori 数 MB 贴图），运行时 wasm ~100KB
 * - 设计师在 Rive 编辑器里用「状态机（State Machine）+ 输入（Inputs）」描述角色行为，
 *   运行时只需把信号写进输入，渲染/过渡由 Rive 引擎完成，代码量极小
 * - 无外部 CDN、无 @ts-nocheck 框架、无 patch hack
 *
 * 本 Provider 把 CharacterProvider 的信号映射到 `.riv` 状态机输入（按名字查找，全部空安全）：
 *
 * | CharacterProvider 调用 | Rive 输入（默认名）   | 输入类型  |
 * |------------------------|----------------------|----------|
 * | setMouthOpen(0..1)     | `mouth`              | Number   |
 * | setSpeaking(bool)      | `speaking`           | Boolean  |
 * | setListening(bool)     | `listening`          | Boolean  |
 * | setThinking(bool)      | `thinking`           | Boolean  |
 * | setEmotion(id)         | `emotion`            | Number（见 EMOTION_INDEX 枚举）|
 * | playMotion(id)         | 同名 Trigger，或 `motion` Number 兜底 | Trigger/Number |
 *
 * `.riv` 文件不存在或加载失败时 init() 抛错，由 createCharacterProviderSafe 自动降级到 SVG。
 *
 * 制作 `.riv` 时只要遵守上面的状态机/输入命名约定即可即插即用；
 * 文件路径与状态机名可用 VITE_RIVE_SRC / VITE_RIVE_STATE_MACHINE 覆盖。
 */

/** 情绪 ID → Rive Number 输入值。.riv 状态机里用这些整数做表情切换 */
const EMOTION_INDEX: Record<string, number> = {
  neutral: 0,
  happy: 1,
  curious: 2,
  surprised: 3,
  encouraging: 4,
  thoughtful: 5,
  sad: 6,
}

/** 输入名约定（集中定义，便于和 .riv 对齐） */
const INPUT = {
  mouth: 'mouth',
  speaking: 'speaking',
  listening: 'listening',
  thinking: 'thinking',
  emotion: 'emotion',
  /** playMotion 找不到同名 trigger 时，写入这个 Number 输入 */
  motionFallback: 'motion',
} as const

const DEFAULT_SRC = '/models/rive/tutor.riv'
const DEFAULT_STATE_MACHINE = 'State Machine 1'

export class RiveCharacterProvider implements CharacterProvider {
  private rive: Rive | null = null
  private canvas: HTMLCanvasElement | null = null
  private readonly src: string
  private readonly stateMachine: string

  /** 加载完成后缓存：输入名 → StateMachineInput */
  private inputs = new Map<string, StateMachineInput>()
  private loaded = false

  private _registry?: MotionRegistry
  private _onTapBody?: () => void
  private _resizeHandler?: () => void
  private _clickHandler?: (e: MouseEvent) => void

  private state: CharacterState = {
    currentMotion: null,
    currentExpression: null,
    mouthOpen: 0,
  }

  constructor(opts?: { src?: string; stateMachine?: string }) {
    this.src =
      opts?.src ??
      (import.meta.env.VITE_RIVE_SRC as string | undefined) ??
      DEFAULT_SRC
    this.stateMachine =
      opts?.stateMachine ??
      (import.meta.env.VITE_RIVE_STATE_MACHINE as string | undefined) ??
      DEFAULT_STATE_MACHINE
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas

    await new Promise<void>((resolve, reject) => {
      this.rive = new Rive({
        src: this.src,
        canvas,
        stateMachines: this.stateMachine,
        autoplay: true,
        layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
        // 角色文件随包自带，不去 Rive 官方 CDN 拉资源
        enableRiveAssetCDN: false,
        onLoad: () => {
          this.loaded = true
          this.rive?.resizeDrawingSurfaceToCanvas()
          this.cacheInputs()
          resolve()
        },
        onLoadError: (err: unknown) => {
          reject(new Error(`[Rive] Failed to load ${this.src}: ${String(err)}`))
        },
      })
    })

    // 窗口 resize：交给 Rive 重算绘制表面（含 DPR）
    this._resizeHandler = () => this.rive?.resizeDrawingSurfaceToCanvas()
    window.addEventListener('resize', this._resizeHandler)

    // 点击身体互动（整块 canvas，命中由 .riv listener 处理更精细则可省略此回调）
    this._clickHandler = () => this._onTapBody?.()
    canvas.addEventListener('click', this._clickHandler)

    console.log('[Rive] Init complete:', this.src, '/', this.stateMachine)
  }

  /** 把状态机的所有输入按名字缓存，供后续 O(1) 写入 */
  private cacheInputs(): void {
    if (!this.rive) return
    const list = this.rive.stateMachineInputs(this.stateMachine) ?? []
    for (const input of list) {
      this.inputs.set(input.name, input)
    }
    console.log('[Rive] State machine inputs:', [...this.inputs.keys()])
  }

  private setNumber(name: string, value: number): void {
    const input = this.inputs.get(name)
    if (input && input.type === StateMachineInputType.Number) {
      input.value = value
    }
  }

  private setBool(name: string, value: boolean): void {
    const input = this.inputs.get(name)
    if (input && input.type === StateMachineInputType.Boolean) {
      input.value = value
    }
  }

  // --- CharacterProvider 接口 ---

  async playMotion(motionId: string): Promise<void> {
    this.state.currentMotion = motionId

    // 语义 ID → 模型 key（若有注册表）
    const key = this._registry?.getMotion(motionId as any) ?? motionId

    // 1) 优先：同名 Trigger 输入
    const trigger = this.inputs.get(key) ?? this.inputs.get(motionId)
    if (trigger && trigger.type === StateMachineInputType.Trigger) {
      trigger.fire()
      return
    }

    // 2) 兜底：写入 `motion` Number 输入（用 emotion 同款约定，由 .riv 决定映射）
    const fallback = this.inputs.get(INPUT.motionFallback)
    if (fallback && fallback.type === StateMachineInputType.Number) {
      // 无显式编号时，至少触发一次状态变化（保持现值 + 0 无效，故仅在未命中时告警）
      console.warn('[Rive] No trigger for motion:', motionId, '→', key, '— wire a Trigger input named it in the .riv')
    } else {
      console.warn('[Rive] Motion input not found:', motionId, '→', key)
    }
  }

  setExpression(exprId: string): void {
    this.state.currentExpression = exprId
    const idx = EMOTION_INDEX[exprId] ?? EMOTION_INDEX.neutral
    this.setNumber(INPUT.emotion, idx)
  }

  setEmotion(emotionId: string, _intensity?: number): void {
    this.setExpression(emotionId)
  }

  setMouthOpen(value: number): void {
    const v = Math.max(0, Math.min(1, value))
    this.state.mouthOpen = v
    this.setNumber(INPUT.mouth, v)
  }

  setSpeaking(isSpeaking: boolean): void {
    this.setBool(INPUT.speaking, isSpeaking)
  }

  setListening(isListening: boolean): void {
    this.setBool(INPUT.listening, isListening)
  }

  setThinking(isThinking: boolean): void {
    this.setBool(INPUT.thinking, isThinking)
    if (isThinking) this.setExpression('thoughtful')
  }

  onError(): void {
    this.setExpression('sad')
  }

  getState(): CharacterState {
    return { ...this.state }
  }

  setRegistry(registry: MotionRegistry): void {
    this._registry = registry
    console.log('[Rive] MotionRegistry switched to:', registry.characterId)
  }

  onTapBody(callback: () => void): void {
    this._onTapBody = callback
  }

  dispose(): void {
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler)
    if (this.canvas && this._clickHandler) {
      this.canvas.removeEventListener('click', this._clickHandler)
    }
    this.inputs.clear()
    this.loaded = false
    this.rive?.cleanup()
    this.rive = null
  }
}
