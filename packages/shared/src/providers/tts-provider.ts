import type { SpeakOptions } from '../types.js'

export interface TTSProvider {
  readonly available: boolean

  speak(text: string, options?: SpeakOptions): Promise<void>

  stop(): void

  onStart?: () => void
  onEnd?: () => void
}
