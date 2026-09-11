/**
 * SSE 事件类型定义
 *
 * 所有事件遵循 SSE 标准格式：
 *   event: <event-name>\n
 *   data: <json-payload>\n\n
 */

export interface SSEEventBase {
  event: string
  data: Record<string, unknown>
}

/** 教师的完整回复（非流式模式） */
export interface TeacherResponseEvent extends SSEEventBase {
  event: 'teacher.response'
  data: {
    requestId?: string
    text: string
    textZh?: string
    motionId?: string
    expressionId?: string
    vocabulary?: string[]
    vocabularySentences?: string[]
    /** 学习者可说的回复建议（每轮 1-3 条短回复，不持久化）。 */
    studentReplyHints?: string[]
    scenario?: {
      id: string
      name: string
      icon: string
      targetWords: string[]
      targetWordsTotal: number
      wordsLearned: string[]
      completed?: boolean
    }
  }
}

/** LLM 流式文本分片（Phase 2） */
export interface TeacherChunkEvent extends SSEEventBase {
  event: 'teacher.chunk'
  data: {
    requestId?: string
    chunk: string
    isEnd: boolean
  }
}

/** 教师的音频回复（TTS） */
export interface TeacherAudioEvent extends SSEEventBase {
  event: 'teacher.audio'
  data: {
    requestId?: string
    /** Base64 编码的音频分片 */
    audioBase64: string
    /** 音频格式：mp3 | opus | wav */
    format: string
    /** 是否为最后一个分片 */
    isEnd: boolean
  }
}

/** 连接时推送给客户端的服务端运行时配置 */
export interface ConfigEvent extends SSEEventBase {
  event: 'config'
  data: {
    ttsSource: 'local' | 'remote'
  }
}

/** 保活心跳 */
export interface HeartbeatEvent extends SSEEventBase {
  event: 'heartbeat'
  data: {
    timestamp: number
  }
}

/** 教师回复被打断（用户开口/发送新消息时，后端 abort 当前 LLM 生成后广播） */
export interface TeacherInterruptedEvent extends SSEEventBase {
  event: 'teacher.interrupted'
  data: {
    requestId?: string
    /** 打断来源：user = 用户主动开口/发送新消息 */
    reason?: 'user'
  }
}

/** 已接受的异步请求在后台执行失败。 */
export interface ErrorEvent extends SSEEventBase {
  event: 'error'
  data: {
    requestId?: string
    code: string
    message: string
  }
}

/** 所有 SSE 事件的联合类型 */
export type SSEEvent =
  | ConfigEvent
  | TeacherResponseEvent
  | TeacherChunkEvent
  | TeacherAudioEvent
  | TeacherInterruptedEvent
  | ErrorEvent
  | HeartbeatEvent
