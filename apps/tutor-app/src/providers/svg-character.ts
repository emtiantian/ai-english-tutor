import type { CharacterProvider, CharacterState } from '@ai-english-tutor/shared'

export class SvgCharacterProvider implements CharacterProvider {
  private state: CharacterState = {
    currentMotion: null,
    currentExpression: null,
    mouthOpen: 0
  }

  async init(_canvas: HTMLCanvasElement): Promise<void> {
    // SVG 角色不需要 canvas，但为了接口一致保留
    return Promise.resolve()
  }

  async playMotion(motionId: string): Promise<void> {
    this.state.currentMotion = motionId
  }

  setExpression(exprId: string): void {
    this.state.currentExpression = exprId
  }

  setMouthOpen(value: number): void {
    this.state.mouthOpen = Math.max(0, Math.min(1, value))
  }

  getState(): CharacterState {
    return { ...this.state }
  }

  dispose(): void {
    // 无资源需要释放
  }
}
