import type { AITeacherProvider, TeachingInput, TeachingResponse } from '@ai-english-tutor/shared'

const WELCOME_LINES = [
  { text: '我重生到电脑里成为你的老师啦？', motionId: 'wave', expressionId: 'happy' },
]

export class PresetTeacherProvider implements AITeacherProvider {
  private index = 0
  private presets = WELCOME_LINES

  async generateResponse(_input: TeachingInput): Promise<TeachingResponse> {
    const preset = this.presets[this.index % this.presets.length]
    this.index++
    return {
      text: preset.text,
      motionId: preset.motionId,
      expressionId: preset.expressionId,
    }
  }
}
