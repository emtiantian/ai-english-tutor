import { logger } from '../../logger.js'
import { broadcastToSession } from '../../sse/handler.js'
import type { TeacherAudioEvent } from '../../sse/types.js'

/**
 * 音频广播模块：通过 SSE 分片广播音频。
 */
export class AudioBroadcaster {
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
    // 6144 字节 -> 8192 个 base64 字符。使用 3 的倍数可保证每个分片的
    // base64 在客户端有效且可直接拼接。
    const byteChunkSize = 6144
    const total = audioBuffer.length

    for (let i = 0; i < total; i += byteChunkSize) {
      const chunk = audioBuffer.subarray(i, i + byteChunkSize)
      const isLast = i + byteChunkSize >= total
      const event = {
        event: eventName as any,
        data: { audioBase64: chunk.toString('base64'), format, isEnd: isLast }
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
  broadcastAudioChunks(audioBase64: string, format: string, sessionId?: string): void {
    const chunkSize = 8192

    for (let i = 0; i < audioBase64.length; i += chunkSize) {
      const chunk = audioBase64.slice(i, i + chunkSize)
      const isLast = i + chunkSize >= audioBase64.length

      const event: TeacherAudioEvent = {
        event: 'teacher.audio',
        data: {
          audioBase64: chunk,
          format,
          isEnd: isLast
        }
      }
      if (sessionId) {
        broadcastToSession(sessionId, event)
      } else {
        logger.warn('未提供 sessionId，跳过音频广播')
      }
    }
  }
}
