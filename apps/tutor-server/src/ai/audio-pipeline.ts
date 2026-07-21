import type { TTSProvider } from '../voice/tts.js'
import type { ASRProvider } from '../voice/asr.js'
import type { LLMProvider } from './llm.js'
import { AsrAdapter } from './audio/asr-adapter.js'
import { TtsOutput } from './audio/tts-output.js'
import { AudioBroadcaster } from './audio/audio-broadcaster.js'
import { logger } from '../logger.js'

/**
 * 音频输入/输出流水线 facade：
 * - 输入：当 LLM 不支持音频时，用 ASR 转写
 * - 输出：当 LLM 不返回音频时，用 TTS 合成
 * - 通过 SSE 分片广播音频
 */
export class AudioPipeline {
  private asrAdapter: AsrAdapter
  private ttsOutput: TtsOutput
  private audioBroadcaster: AudioBroadcaster

  constructor(
    private tts: TTSProvider,
    private asr: ASRProvider,
    private llm: LLMProvider
  ) {
    this.asrAdapter = new AsrAdapter(asr, llm)
    this.ttsOutput = new TtsOutput(tts)
    this.audioBroadcaster = new AudioBroadcaster()
  }

  /**
   * 将音频转写为文本（仅 ASR，不构建消息）
   * 返回转写后的文本；如果没有音频则返回原始文本
   */
  async transcribeAudio(
    text: string,
    audioBase64: string | undefined,
    audioFormat: string
  ): Promise<string> {
    return this.asrAdapter.transcribeAudio(text, audioBase64, audioFormat)
  }

  /**
   * 通过 TTS 将文本合成为语音，并通过 SSE 广播。
   * 返回 base64 音频（如果有）。
   */
  async handleOutput(
    text: string,
    voiceDesign?: string,
    sessionId?: string
  ): Promise<{ audioBase64?: string }> {
    const result = await this.ttsOutput.handleOutput(text, voiceDesign)
    if (result.audioBase64) {
      this.audioBroadcaster.broadcastAudioChunks(
        result.audioBase64,
        this.tts.outputFormat,
        sessionId
      )
      logger.info({ size: Buffer.byteLength(result.audioBase64, 'base64') }, 'TTS 音频广播完成')
    }
    return result
  }

  /**
   * 直接将文本合成为音频缓冲区（不广播）。
   * 用于在英语之外同步播放中文 TTS。
   */
  async synthesizeDirect(text: string, voiceDesign?: string): Promise<Buffer> {
    return this.ttsOutput.synthesizeDirect(text, voiceDesign)
  }

  /**
   * 使用自定义 SSE 事件名广播音频分片。
   * 接收原始 Buffer 并实时将每个分片编码为 base64，避免
   * 把整个音频作为单个 base64 字符串加载到内存中。
   */
  broadcastAudioChunksDirect(
    audioBuffer: Buffer,
    format: string,
    sessionId: string | undefined,
    eventName: string
  ): void {
    this.audioBroadcaster.broadcastAudioChunksDirect(audioBuffer, format, sessionId, eventName)
  }
}
