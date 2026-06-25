import { logger } from '../logger.js'
import { broadcast, broadcastToSession } from '../sse/handler.js'
import type { TeacherAudioEvent } from '../sse/types.js'
import type { TTSProvider } from '../voice/tts.js'
import type { ASRProvider } from '../voice/asr.js'
import type { LLMProvider, LLMMessage } from './llm.js'
import { extractTextContent } from './llm.js'
import { buildTeachingMessages, type OpeningStyle } from './prompts/teaching.js'
import type { CharacterPersona } from '@ai-english-tutor/shared'

/**
 * Handles the audio input/output pipeline:
 * - Input: ASR transcription when LLM doesn't support audio
 * - Output: TTS synthesis when LLM doesn't return audio
 * - Broadcasting audio via SSE chunks
 */
export class AudioPipeline {
  constructor(
    private tts: TTSProvider,
    private asr: ASRProvider,
    private llm: LLMProvider,
  ) {}

  /**
   * Process user input: handle audio transcription if needed.
   * Returns the LLM messages to send and the final user text.
   */
  /**
   * Transcribe audio to text (ASR only, no message building)
   * Returns the transcribed text, or the original text if no audio
   */
  async transcribeAudio(
    text: string,
    audioBase64: string | undefined,
    audioFormat: string,
  ): Promise<string> {
    if (!audioBase64) {
      logger.info({ text: text.slice(0, 50) }, '[ASR] No audio provided, using text as-is')
      return text
    }

    // If LLM supports audio input, skip ASR
    if (this.llm.capabilities.supportsAudioInput) {
      logger.info('[ASR] LLM supports audio input, skipping ASR')
      return text
    }

    // Use ASR to transcribe
    try {
      const audioBuffer = Buffer.from(audioBase64, 'base64')
      logger.info({ provider: this.asr.name, audioSize: audioBuffer.length, format: audioFormat }, '[ASR] Starting transcription...')
      const asrResult = await this.asr.transcribe(audioBuffer, `audio/${audioFormat}`)
      logger.info({ provider: this.asr.name, transcribed: asrResult.text.slice(0, 100), fullLength: asrResult.text.length }, '[ASR] Transcription complete')
      return asrResult.text
    } catch (err) {
      logger.error({ err, text }, '[ASR] Transcription failed, using provided text as fallback')
      return text
    }
  }

  async processInput(
    text: string,
    audioBase64: string | undefined,
    audioFormat: string,
    session: {
      level: number
      history: Array<{ role: 'user' | 'assistant'; content: string }>
      openingStyle?: OpeningStyle
    },
    persona: CharacterPersona,
  ): Promise<{ messages: LLMMessage[]; userText: string }> {
    // If audio provided and LLM supports audio input, send directly
    if (audioBase64 && this.llm.capabilities.supportsAudioInput) {
      logger.debug('Sending audio directly to LLM (provider supports audio input)')

      const messages = buildTeachingMessages(text, session.level, session.history, session.openingStyle, persona)
      // Convert last user message to multimodal (text + audio)
      const lastMsg = messages[messages.length - 1]
      if (lastMsg && lastMsg.role === 'user') {
        lastMsg.content = [
          { type: 'text', text: extractTextContent(lastMsg) || text },
          { type: 'audio', data: audioBase64, format: audioFormat },
        ]
      }

      return { messages, userText: text }
    }

    // If audio provided but LLM doesn't support audio input, use ASR
    let finalText = text
    if (audioBase64 && !this.llm.capabilities.supportsAudioInput) {
      logger.debug('Provider does not support audio input, using ASR')
      try {
        const audioBuffer = Buffer.from(audioBase64, 'base64')
        const asrResult = await this.asr.transcribe(audioBuffer, `audio/${audioFormat}`)
        finalText = asrResult.text
        logger.info({ transcribed: finalText.slice(0, 50) }, 'ASR transcription complete')
      } catch (err) {
        logger.error({ err }, 'ASR failed, using provided text as fallback')
      }
    }

    const messages = buildTeachingMessages(finalText, session.level, session.history, session.openingStyle, persona)
    return { messages, userText: finalText }
  }

  /**
   * Synthesize text to speech via TTS and broadcast via SSE.
   * Returns the base64 audio (if any).
   */
  async handleOutput(
    text: string,
    voiceDesign?: string,
    sessionId?: string,
  ): Promise<{ audioBase64?: string }> {
    if (!text || text.trim().length === 0) {
      return {}
    }

    try {
      logger.debug({ textLength: text.length }, 'Generating TTS audio')
      const audioBuffer = await this.tts.synthesize(text, { voiceDesign })
      const audioBase64 = audioBuffer.toString('base64')

      this.broadcastAudioChunks(audioBase64, 'mp3', sessionId)
      logger.info({ size: audioBuffer.length }, 'TTS audio broadcast complete')

      return { audioBase64 }
    } catch (err) {
      logger.error({ err }, 'TTS audio generation failed')
      return {}
    }
  }

  /**
   * Directly synthesize text to audio buffer (no broadcast).
   * Used for Chinese TTS alongside English.
   */
  async synthesizeDirect(text: string, voiceDesign?: string): Promise<Buffer> {
    return this.tts.synthesize(text, { voiceDesign, format: 'mp3' })
  }

  /**
   * Broadcast audio chunks with a custom SSE event name.
   * Accepts a raw Buffer and encodes each chunk to base64 on the fly to avoid
   * loading the entire audio into memory as a single base64 string.
   */
  broadcastAudioChunksDirect(audioBuffer: Buffer, format: string, sessionId: string | undefined, eventName: string): void {
    // 6144 bytes -> 8192 base64 chars. Using a multiple of 3 keeps each chunk's
    // base64 valid and concatenable on the client.
    const byteChunkSize = 6144
    const total = audioBuffer.length

    for (let i = 0; i < total; i += byteChunkSize) {
      const chunk = audioBuffer.subarray(i, i + byteChunkSize)
      const isLast = i + byteChunkSize >= total
      const event = {
        event: eventName as any,
        data: { audioBase64: chunk.toString('base64'), format, isEnd: isLast },
      }
      if (sessionId) {
        const ok = broadcastToSession(sessionId, event as any)
        if (!ok) break
      }
    }
  }

  /**
   * Broadcast audio via SSE in 8KB chunks.
   */
  private broadcastAudioChunks(audioBase64: string, format: string, sessionId?: string): void {
    const chunkSize = 8192

    for (let i = 0; i < audioBase64.length; i += chunkSize) {
      const chunk = audioBase64.slice(i, i + chunkSize)
      const isLast = i + chunkSize >= audioBase64.length

      const event: TeacherAudioEvent = {
        event: 'teacher.audio',
        data: {
          audioBase64: chunk,
          format,
          isEnd: isLast,
        },
      }
      if (sessionId) {
        broadcastToSession(sessionId, event)
      } else {
        broadcast(event)
      }
    }
  }
}
