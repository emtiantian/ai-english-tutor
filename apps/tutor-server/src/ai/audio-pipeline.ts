import type { TTSProvider } from '../voice/tts.js'
import { AudioBroadcaster } from './audio/audio-broadcaster.js'
import { TtsOutput } from './audio/tts-output.js'
import { logger } from '../logger.js'

/** Converts teacher text to audio and broadcasts it to the current SSE session. */
export class AudioPipeline {
  private output: TtsOutput
  private broadcaster = new AudioBroadcaster()

  constructor(private tts: TTSProvider) {
    this.output = new TtsOutput(tts)
  }

  async handleOutput(
    text: string,
    voiceDesign?: string,
    sessionId?: string,
    requestId?: string,
    signal?: AbortSignal
  ): Promise<{ audioBase64?: string }> {
    const result = await this.output.handleOutput(text, voiceDesign, signal)
    if (!result.audioBase64 || signal?.aborted) return {}
    this.broadcaster.broadcastAudioChunks(
      result.audioBase64,
      this.tts.outputFormat,
      sessionId,
      requestId
    )
    logger.info({ size: Buffer.byteLength(result.audioBase64, 'base64') }, 'TTS 音频广播完成')
    return result
  }
}
