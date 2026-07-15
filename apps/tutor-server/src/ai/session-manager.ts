import { LRUCache } from 'lru-cache'
import { logger } from '../logger.js'
import type { CEFRLevel } from '@ai-english-tutor/shared'
import type { OpeningStyle } from './prompts/teaching.js'
import {
  saveSession,
  getSession as getSessionFromDb,
  saveScenarioState as saveScenarioStateToDb,
} from '../db/repositories/session.js'
import { getSessionMessages, saveMessage } from '../db/repositories/message.js'

/** 会话内的场景状态 */
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

/** 内存中持有的会话数据 */
export interface SessionData {
  level: number
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  vocabulary: Set<string>
  openingStyle?: OpeningStyle
  voiceDesign?: string
  /** 用于词汇跟踪的用户 ID（匿名会话为 null） */
  userId?: string
  /** 场景状态（若处于场景课程中） */
  scenario?: ScenarioState
}

/** 从其 JSON 数据库表示重建 ScenarioState。 */
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
    logger.error({ err, jsonPreview: json.slice(0, 200) }, '解析 scenario_state 失败')
    return undefined
  }
}

/**
 * 管理会话生命周期：内存缓存 + SQLite 持久化。
 *
 * 优先读取缓存，回退到数据库，然后回填缓存。
 */
export class SessionManager {
  private sessions = new LRUCache<string, SessionData>({
    max: 1000,
    ttl: 1000 * 60 * 60, // 1 小时
  })

  /**
   * 获取已有会话或创建新会话。
   * 尝试顺序：缓存 → 数据库 → 新建。
   */
  getOrCreate(sessionId: string, level: number): SessionData {
    // 缓存命中
    const cached = this.sessions.get(sessionId)
    if (cached) return cached

    // 数据库回退
    const dbSession = getSessionFromDb(sessionId)
    if (dbSession) {
      const dbMessages = getSessionMessages(sessionId)
      const session: SessionData = {
        level: dbSession.level,
        history: dbMessages.map((m) => ({ role: m.role, content: m.content })),
        vocabulary: new Set(),
        voiceDesign: dbSession.voiceDesign,
        scenario: dbSession.scenarioState ? parseScenarioState(dbSession.scenarioState) : undefined,
      }
      this.sessions.set(sessionId, session)
      return session
    }

    // 创建新会话
    const session: SessionData = {
      level,
      history: [],
      vocabulary: new Set(),
    }
    this.sessions.set(sessionId, session)
    return session
  }

  /**
   * 在缓存中设置会话（用于初始化新课）。
   */
  set(sessionId: string, session: SessionData): void {
    this.sessions.set(sessionId, session)
  }

  /**
   * 将会话元数据持久化到数据库。
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
   * 将当前场景状态持久化到数据库。
   */
  saveScenarioState(sessionId: string, scenario: ScenarioState): void {
    const serialized: Omit<ScenarioState, 'wordsUsed'> & { wordsUsed: string[] } = {
      ...scenario,
      wordsUsed: Array.from(scenario.wordsUsed),
    }
    saveScenarioStateToDb(sessionId, JSON.stringify(serialized))
  }

  /**
   * 追加一条消息到会话历史并持久化到数据库。
   */
  addMessage(
    sessionId: string,
    session: SessionData,
    role: 'user' | 'assistant',
    content: string,
    metadata?: { motionId?: string; expressionId?: string; vocabulary?: string[]; vocabularySentences?: string[] },
  ): void {
    session.history.push({ role, content })

    // 跟踪词汇
    if (metadata?.vocabulary) {
      for (const word of metadata.vocabulary) {
        session.vocabulary.add(word.toLowerCase())
      }
    }

    // 持久化到数据库
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
   * 仅从缓存获取会话（不查数据库）。
   */
  getFromCache(sessionId: string): SessionData | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * 获取供 API 响应的会话信息。
   * 优先尝试缓存，否则回退数据库。
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
