import { logger } from '../../logger.js'
import { broadcastToSession } from '../../sse/handler.js'
import type { TeacherAudioEvent } from '../../sse/types.js'

/**
 * 音频广播模块：通过 SSE 分片广播音频。
 */
export class AudioBroadcaster {
  /**
   * 通过 SSE 以 8KB 分片广播音频。
   */
  broadcastAudioChunks(
    audioBase64: string,
    format: string,
    sessionId?: string,
    requestId?: string
  ): void {
    const chunkSize = 8192

    for (let i = 0; i < audioBase64.length; i += chunkSize) {
      const chunk = audioBase64.slice(i, i + chunkSize)
      const isLast = i + chunkSize >= audioBase64.length

      const event: TeacherAudioEvent = {
        event: 'teacher.audio',
        data: {
          requestId,
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
