/**
 * Voice Input Provider Interface
 *
 * Handles voice input from the user (microphone recording, etc.)
 */
export interface VoiceInputProvider {
  /** Start recording from microphone */
  startRecording(): Promise<void>

  /** Stop recording and return audio data */
  stopRecording(): Promise<{ data: string; format: string }>

  /** Whether currently recording */
  isRecording(): boolean

  /** Clean up resources */
  dispose(): void
}
