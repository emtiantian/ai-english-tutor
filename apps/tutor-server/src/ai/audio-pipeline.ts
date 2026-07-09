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
 * 处理音频输入/输出流水线：
 * - 输入：当 LLM 不支持音频时，用 ASR 转写
 * - 输出：当 LLM 不返回音频时，用 TTS 合成
 * - 通过 SSE 分片广播音频
 */
export class AudioPipeline {
  constructor(
    private tts: TTSProvider,
    private asr: ASRProvider,
    private llm: LLMProvider,
  ) {}

  /**
   * 处理用户输入：按需进行音频转写。
   * 返回要发送给 LLM 的消息以及最终用户文本。
   */
  /**
   * 将音频转写为文本（仅 ASR，不构建消息）
   * 返回转写后的文本；如果没有音频则返回原始文本
   */
  async transcribeAudio(
    text: string,
    audioBase64: string | undefined,
    audioFormat: string,
  ): Promise<string> {
    if (!audioBase64) {
      logger.info({ text: text.slice(0, 50) }, '[ASR] 未提供音频，直接使用文本')
      return text
    }

    // 如果 LLM 支持音频输入，则跳过 ASR
    if (this.llm.capabilities.supportsAudioInput) {
      logger.info(
        { llm: this.llm.name, asrProviderConfigured: this.asr.name },
        '[ASR] LLM 支持语音输入，音频直接发送给 LLM，不调用独立 ASR 提供商',
      )
      return text
    }

    // 使用 ASR 进行转写
    try {
      const audioBuffer = Buffer.from(audioBase64, 'base64')
      logger.info({ provider: this.asr.name, audioSize: audioBuffer.length, format: audioFormat }, '[ASR] 开始转写...')
      const asrResult = await this.asr.transcribe(audioBuffer, `audio/${audioFormat}`)
      logger.info({ provider: this.asr.name, transcribed: asrResult.text.slice(0, 100), fullLength: asrResult.text.length }, '[ASR] 转写完成')
      return asrResult.text
    } catch (err) {
      logger.error({ err, text }, '[ASR] 转写失败，使用提供的文本兜底')
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
    // 如果提供了音频且 LLM 支持音频输入，则直接发送
    if (audioBase64 && this.llm.capabilities.supportsAudioInput) {
      logger.info(
        { llm: this.llm.name, audioFormat, mime: `audio/${audioFormat}`, base64Size: audioBase64.length },
        '[LLM] 直接将音频发送给支持语音的 LLM（不调用独立 ASR）',
      )

      const messages = buildTeachingMessages(text, session.level, session.history, session.openingStyle, persona)
      // 将最后一条用户消息转换为多模态（文本 + 音频）
      const lastMsg = messages[messages.length - 1]
      if (lastMsg && lastMsg.role === 'user') {
        lastMsg.content = [
          { type: 'text', text: extractTextContent(lastMsg) || text },
          { type: 'audio', data: audioBase64, format: audioFormat },
        ]
      }

      return { messages, userText: text }
    }

    // 如果提供了音频但 LLM 不支持音频输入，则使用 ASR
    let finalText = text
    if (audioBase64 && !this.llm.capabilities.supportsAudioInput) {
      logger.debug('提供商不支持音频输入，使用 ASR')
      try {
        const audioBuffer = Buffer.from(audioBase64, 'base64')
        const asrResult = await this.asr.transcribe(audioBuffer, `audio/${audioFormat}`)
        finalText = asrResult.text
        logger.info({ transcribed: finalText.slice(0, 50) }, 'ASR 转写完成')
      } catch (err) {
        logger.error({ err }, 'ASR 失败，使用提供的文本兜底')
      }
    }

    const messages = buildTeachingMessages(finalText, session.level, session.history, session.openingStyle, persona)
    return { messages, userText: finalText }
  }

  /**
   * 通过 TTS 将文本合成为语音，并通过 SSE 广播。
   * 返回 base64 音频（如果有）。
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
      logger.debug({ textLength: text.length }, '生成 TTS 音频')
      const audioBuffer = await this.tts.synthesize(text, { voiceDesign })
      const audioBase64 = audioBuffer.toString('base64')

      this.broadcastAudioChunks(audioBase64, 'mp3', sessionId)
      logger.info({ size: audioBuffer.length }, 'TTS 音频广播完成')

      return { audioBase64 }
    } catch (err) {
      logger.error({ err }, 'TTS 音频生成失败')
      return {}
    }
  }

  /**
   * 直接将文本合成为音频缓冲区（不广播）。
   * 用于在英语之外同步播放中文 TTS。
   */
  async synthesizeDirect(text: string, voiceDesign?: string): Promise<Buffer> {
    return this.tts.synthesize(text, { voiceDesign, format: 'mp3' })
  }

  /**
   * 使用自定义 SSE 事件名广播音频分片。
   * 接收原始 Buffer 并实时将每个分片编码为 base64，避免
   * 把整个音频作为单个 base64 字符串加载到内存中。
   */
  broadcastAudioChunksDirect(audioBuffer: Buffer, format: string, sessionId: string | undefined, eventName: string): void {
    // 6144 字节 -> 8192 个 base64 字符。使用 3 的倍数可保证每个分片的
    // base64 在客户端有效且可直接拼接。
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
   * 通过 SSE 以 8KB 分片广播音频。
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
