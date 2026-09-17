import { LRUCache } from 'lru-cache'
import type { CEFRLevel, TeachingResponse } from '@ai-english-tutor/shared'

export interface ScenarioState {
  id: string
  name: string
  icon: string
  level: CEFRLevel
  targetWords: string[]
  wordsUsed: Set<string>
}

export interface SessionData {
  level: number
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  vocabulary: Set<string>
  voiceDesign?: string
  scenario?: ScenarioState
}

/** First-release sessions are deliberately ephemeral and expire after one hour. */
export class SessionManager {
  private sessions = new LRUCache<string, SessionData>({ max: 1000, ttl: 60 * 60 * 1000 })

  getOrCreate(sessionId: string, level: number): SessionData {
    const existing = this.sessions.get(sessionId)
    if (existing) return existing
    const session: SessionData = { level, history: [], vocabulary: new Set() }
    this.sessions.set(sessionId, session)
    return session
  }

  addMessage(
    _sessionId: string,
    session: SessionData,
    role: 'user' | 'assistant',
    content: string,
    metadata?: TeachingResponse
  ): void {
    const historyContent =
      role === 'assistant' && metadata ? serializeAssistantHistory(metadata, content) : content
    session.history.push({ role, content: historyContent })
    for (const word of metadata?.vocabulary ?? []) session.vocabulary.add(word.toLowerCase())
  }

  getFromCache(sessionId: string): SessionData | undefined {
    return this.sessions.get(sessionId)
  }

  getSessionInfo(sessionId: string) {
    const session = this.sessions.get(sessionId)
    if (!session) return undefined
    return {
      level: session.level,
      historyCount: session.history.length,
      vocabularyCount: session.vocabulary.size
    }
  }
}

/**
 * Assistant 历史必须保持与当前响应契约相同的 JSON 形状。
 * 若只保存解析后的英文正文，模型会逐轮模仿纯文本历史并停止返回结构化字段。
 */
function serializeAssistantHistory(metadata: TeachingResponse, fallbackText: string): string {
  return JSON.stringify({
    text: metadata.text || fallbackText,
    textZh: metadata.textZh ?? '',
    motionId: metadata.motionId ?? 'nod',
    expressionId: metadata.expressionId ?? 'neutral',
    vocabulary: metadata.vocabulary ?? [],
    vocabularySentences: metadata.vocabularySentences ?? [],
    studentReplyHints: metadata.studentReplyHints ?? []
  })
}
