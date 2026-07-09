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
    chunk: string
    isEnd: boolean
  }
}

/** 英语水平评估结果 */
export interface LevelResultEvent extends SSEEventBase {
  event: 'level.result'
  data: {
    level: number
    reason: string
  }
}

/** 教师的音频回复（TTS） */
export interface TeacherAudioEvent extends SSEEventBase {
  event: 'teacher.audio'
  data: {
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

/** 所有 SSE 事件的联合类型 */
export type SSEEvent =
  | ConfigEvent
  | TeacherResponseEvent
  | TeacherChunkEvent
  | LevelResultEvent
  | TeacherAudioEvent
  | HeartbeatEvent
