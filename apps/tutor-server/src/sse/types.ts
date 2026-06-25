/**
 * SSE Event Type Definitions
 *
 * All events follow the SSE standard format:
 *   event: <event-name>\n
 *   data: <json-payload>\n\n
 */

export interface SSEEventBase {
  event: string
  data: Record<string, unknown>
}

/** Teacher's complete response (non-streaming mode) */
export interface TeacherResponseEvent extends SSEEventBase {
  event: 'teacher.response'
  data: {
    text: string
    textZh?: string
    motionId?: string
    expressionId?: string
    vocabulary?: string[]
    vocabularySentences?: string[]
    /** Learner-voiced reply suggestions (1-3 short replies the student could say next). Per-turn, not persisted. */
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

/** Streaming text chunk from LLM (Phase 2) */
export interface TeacherChunkEvent extends SSEEventBase {
  event: 'teacher.chunk'
  data: {
    chunk: string
    isEnd: boolean
  }
}

/** English level assessment result */
export interface LevelResultEvent extends SSEEventBase {
  event: 'level.result'
  data: {
    level: number
    reason: string
  }
}

/** Teacher's audio response (TTS) */
export interface TeacherAudioEvent extends SSEEventBase {
  event: 'teacher.audio'
  data: {
    /** Base64 encoded audio chunk */
    audioBase64: string
    /** Audio format: mp3 | opus | wav */
    format: string
    /** Whether this is the last chunk */
    isEnd: boolean
  }
}

/** Server runtime config pushed to client on connect */
export interface ConfigEvent extends SSEEventBase {
  event: 'config'
  data: {
    ttsSource: 'local' | 'remote'
  }
}

/** Keep-alive heartbeat */
export interface HeartbeatEvent extends SSEEventBase {
  event: 'heartbeat'
  data: {
    timestamp: number
  }
}

/** Chinese translation audio (TTS) */
export interface ChineseAudioEvent extends SSEEventBase {
  event: 'teacher.chinese-audio'
  data: {
    audioBase64: string
    format: string
    isEnd: boolean
  }
}

/** Union type of all SSE events */
export type SSEEvent =
  | ConfigEvent
  | TeacherResponseEvent
  | TeacherChunkEvent
  | LevelResultEvent
  | TeacherAudioEvent
  | ChineseAudioEvent
  | HeartbeatEvent
