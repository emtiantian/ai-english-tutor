import type { AITeacherProvider, TeachingInput, TeachingResponse } from '@ai-english-tutor/shared'
import type { TutorClient } from '../client/TutorClient'

/**
 * Remote AI Teacher Provider — communicates with tutor-server backend.
 *
 * Implements the existing AITeacherProvider interface, enabling seamless
 * swapping from local (PresetTeacherProvider) to remote backend.
 */
export class RemoteTeacherProvider implements AITeacherProvider {
  constructor(private client: TutorClient) {}

  async generateResponse(input: TeachingInput): Promise<TeachingResponse> {
    // Notify UI: user message sent
    this.client.emit('message.user', {
      text: input.text,
      isVoice: false,
    })

    // Notify UI: AI is thinking
    this.client.emit('state.thinking', undefined)

    // Send HTTP request and wait for the full response.
    // SSE events are also broadcast by the backend, but this provider path needs
    // a synchronous TeachingResponse, so we use non-streaming mode.
    const response = await this.client.sendMessage({
      type: 'user.speak',
      text: input.text,
      level: input.level,
    })

    return {
      text: response.text,
      motionId: response.motionId,
      expressionId: response.expressionId,
      vocabulary: response.vocabulary,
    }
  }
}
