import { LRUCache } from 'lru-cache'
import type { CEFRLevel, OpeningStyle } from '@ai-english-tutor/shared'

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
  openingStyle?: OpeningStyle
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
    metadata?: { vocabulary?: string[] }
  ): void {
    session.history.push({ role, content })
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
