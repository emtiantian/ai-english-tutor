import { LRUCache } from 'lru-cache'
import { logger } from '../logger.js'
import { HIYORI_MOTION_REGISTRY, type MotionRegistry } from '@ai-english-tutor/shared'
import type { CEFRLevel } from '@ai-english-tutor/shared'
import type { OpeningStyle } from './prompts/teaching.js'
import {
  saveSession,
  getSession as getSessionFromDb,
  getSessionMessages,
  saveMessage,
  saveScenarioState as saveScenarioStateToDb,
} from '../db/session-store.js'

/** Scenario state within a session */
export interface ScenarioState {
  id: string
  name: string
  icon: string
  /** v2: 当前挑战的 CEFR 档 */
  level?: CEFRLevel
  targetWords: string[]
  /** v2: 硬上限轮次，默认 20 */
  maxTurns: number
  objectives: Array<{
    id: string
    description: string
    descriptionEn: string
    keywords: string[]
    targetWords: string[]
  }>
  turnsCount: number
  wordsUsed: Set<string>
}

/** Session data held in memory */
export interface SessionData {
  level: number
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  vocabulary: Set<string>
  openingStyle?: OpeningStyle
  voiceDesign?: string
  motionRegistry: MotionRegistry
  /** User ID for vocabulary tracking (null for anonymous sessions) */
  userId?: string
  /** Scenario state (if in a scenario lesson) */
  scenario?: ScenarioState
}

/** Reconstruct a ScenarioState from its JSON DB representation. */
function parseScenarioState(json: string): ScenarioState | undefined {
  try {
    const parsed = JSON.parse(json) as Partial<ScenarioState> & { wordsUsed?: string[] }
    if (!parsed.id || !Array.isArray(parsed.targetWords)) return undefined
    return {
      id: parsed.id,
      name: parsed.name ?? parsed.id,
      icon: parsed.icon ?? '',
      level: parsed.level,
      targetWords: parsed.targetWords,
      maxTurns: typeof parsed.maxTurns === 'number' ? parsed.maxTurns : 20,
      objectives: Array.isArray(parsed.objectives) ? parsed.objectives : [],
      turnsCount: typeof parsed.turnsCount === 'number' ? parsed.turnsCount : 0,
      wordsUsed: new Set(Array.isArray(parsed.wordsUsed) ? parsed.wordsUsed : []),
    }
  } catch (err) {
    logger.error({ err, jsonPreview: json.slice(0, 200) }, 'Failed to parse scenario_state')
    return undefined
  }
}

/**
 * Manages session lifecycle: in-memory cache + SQLite persistence.
 *
 * Reads from cache first, falls back to DB, then populates cache.
 */
export class SessionManager {
  private sessions = new LRUCache<string, SessionData>({
    max: 1000,
    ttl: 1000 * 60 * 60, // 1 hour
  })

  /**
   * Get an existing session or create a new one.
   * Tries cache → DB → creates new.
   */
  getOrCreate(sessionId: string, level: number): SessionData {
    // Cache hit
    const cached = this.sessions.get(sessionId)
    if (cached) return cached

    // DB fallback
    const dbSession = getSessionFromDb(sessionId)
    if (dbSession) {
      const dbMessages = getSessionMessages(sessionId)
      const session: SessionData = {
        level: dbSession.level,
        history: dbMessages.map((m) => ({ role: m.role, content: m.content })),
        vocabulary: new Set(),
        motionRegistry: HIYORI_MOTION_REGISTRY,
        voiceDesign: dbSession.voiceDesign,
        scenario: dbSession.scenarioState ? parseScenarioState(dbSession.scenarioState) : undefined,
      }
      this.sessions.set(sessionId, session)
      return session
    }

    // Create new
    const session: SessionData = {
      level,
      history: [],
      vocabulary: new Set(),
      motionRegistry: HIYORI_MOTION_REGISTRY,
    }
    this.sessions.set(sessionId, session)
    return session
  }

  /**
   * Set a session in cache (used when initializing a new lesson).
   */
  set(sessionId: string, session: SessionData): void {
    this.sessions.set(sessionId, session)
  }

  /**
   * Persist session metadata to DB.
   */
  saveSessionToDb(sessionId: string, level: number, styleName: string, voiceDesign: string): void {
    saveSession({
      id: sessionId,
      level,
      styleName,
      voiceDesign,
      createdAt: Math.floor(Date.now() / 1000),
    })
  }

  /**
   * Persist the current scenario state to DB.
   */
  saveScenarioState(sessionId: string, scenario: ScenarioState): void {
    const serialized: Omit<ScenarioState, 'wordsUsed'> & { wordsUsed: string[] } = {
      ...scenario,
      wordsUsed: Array.from(scenario.wordsUsed),
    }
    saveScenarioStateToDb(sessionId, JSON.stringify(serialized))
  }

  /**
   * Append a message to session history and persist to DB.
   */
  addMessage(
    sessionId: string,
    session: SessionData,
    role: 'user' | 'assistant',
    content: string,
    metadata?: { motionId?: string; expressionId?: string; vocabulary?: string[]; vocabularySentences?: string[] },
  ): void {
    session.history.push({ role, content })

    // Track vocabulary
    if (metadata?.vocabulary) {
      for (const word of metadata.vocabulary) {
        session.vocabulary.add(word.toLowerCase())
      }
    }

    // Persist to DB
    saveMessage({
      sessionId,
      role,
      content,
      motionId: metadata?.motionId,
      expressionId: metadata?.expressionId,
      vocabulary: metadata?.vocabulary,
      vocabularySentences: metadata?.vocabularySentences,
    })
  }

  /**
   * Get a session from cache only (no DB fallback).
   */
  getFromCache(sessionId: string): SessionData | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * Get session info for API response.
   * Tries cache first, falls back to DB.
   */
  getSessionInfo(sessionId: string): { level: number; historyCount: number; vocabularyCount: number } | undefined {
    const session = this.sessions.get(sessionId)
    if (session) {
      return {
        level: session.level,
        historyCount: session.history.length,
        vocabularyCount: session.vocabulary.size,
      }
    }

    const dbSession = getSessionFromDb(sessionId)
    if (!dbSession) return undefined

    const dbMessages = getSessionMessages(sessionId)
    return {
      level: dbSession.level,
      historyCount: dbMessages.length,
      vocabularyCount: 0,
    }
  }
}
