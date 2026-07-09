import type { TTSProvider, SpeakOptions } from '@ai-english-tutor/shared'

export class SpeechSynthesisTTSProvider implements TTSProvider {
  private synth: SpeechSynthesis
  private currentUtterance: SpeechSynthesisUtterance | null = null
  private _onStart?: () => void
  private _onEnd?: () => void
  /** 缓存的语音（iOS 上 getVoices() 首次调用时返回空数组） */
  private voices: SpeechSynthesisVoice[] = []

  constructor() {
    this.synth = window.speechSynthesis
    this.voices = this.synth.getVoices()
    if (this.voices.length === 0) {
      this.synth.addEventListener('voiceschanged', () => {
        this.voices = this.synth.getVoices()
      })
    }
  }

  get available(): boolean {
    return 'speechSynthesis' in window
  }

  set onStart(fn: (() => void) | undefined) { this._onStart = fn }
  set onEnd(fn: (() => void) | undefined) { this._onEnd = fn }

  async speak(text: string, options?: SpeakOptions): Promise<void> {
    return new Promise((resolve) => {
      if (!this.available) {
        resolve()
        return
      }

      this.synth.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'en-US'
      if (options?.rate !== undefined) utterance.rate = options.rate
      if (options?.pitch !== undefined) utterance.pitch = options.pitch
      if (options?.volume !== undefined) utterance.volume = options.volume

      const voices = this.voices.length > 0 ? this.voices : this.synth.getVoices()
      const englishVoice = voices.find(v => v.lang.startsWith('en') && v.voiceURI.includes('Samantha'))
        || voices.find(v => v.lang.startsWith('en'))
      if (englishVoice) utterance.voice = englishVoice

      utterance.onstart = () => this._onStart?.()
      utterance.onend = () => {
        this._onEnd?.()
        resolve()
      }
      utterance.onerror = () => resolve()

      this.currentUtterance = utterance
      this.synth.speak(utterance)
    })
  }

  stop(): void {
    this.synth.cancel()
  }
}
