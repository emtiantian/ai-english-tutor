import type { TeachingInput, TeachingResponse } from '../types.js'

export interface AITeacherProvider {
  generateResponse(input: TeachingInput): Promise<TeachingResponse>
}
