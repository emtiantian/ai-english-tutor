import { logger } from '../logger.js'
import type { CEFRLevel } from '@ai-english-tutor/shared'
import { createLLMProvider } from './llm.js'
import { createTTSProvider } from '../voice/tts.js'
import { createASRProvider } from '../voice/asr.js'
import { SessionManager } from './session-manager.js'
import { AudioPipeline } from './audio-pipeline.js'
import { VocabTracker } from './vocab-tracker.js'
import { loadPersona } from '../vocab/loader.js'
import { FreeFormEngine } from './engines/free-form-engine.js'
import { ScenarioEngine } from './engines/scenario-engine.js'
import { VocabEngine } from './engines/vocab-engine.js'
import { ResponseOrchestrator } from './response/response-orchestrator.js'

/**
 * AI 教学引擎 facade
 *
 * 将具体业务逻辑委托给子引擎：
 * - FreeFormEngine：自由对话课程
 * - ScenarioEngine：场景化角色扮演课程
 * - VocabEngine：词汇解释
 * - ResponseOrchestrator：用户轮次响应（流式/非流式）
 */
export class TutorEngine {
  private llm = createLLMProvider()
  private persona = loadPersona()
  private sessions = new SessionManager(this.persona)
  private audio = new AudioPipeline(createTTSProvider(), createASRProvider(), this.llm)
  private vocabTracker = new VocabTracker()

  private freeForm = new FreeFormEngine(this.llm, this.sessions, this.audio, this.persona)
  private scenario = new ScenarioEngine(
    this.llm,
    this.sessions,
    this.audio,
    this.vocabTracker,
    this.persona
  )
  private vocab = new VocabEngine(this.llm)
  private orchestrator = new ResponseOrchestrator(
    this.llm,
    this.sessions,
    this.audio,
    this.vocabTracker,
    this.persona
  )

  /**
   * 开始新课（自由对话或场景化）
   */
  async startLesson(
    level: number,
    sessionId?: string,
    userId?: string,
    scenarioId?: string,
    styleName?: string,
    targetLevel?: CEFRLevel,
    resumeFrom?: string,
    stream?: boolean,
    signal?: AbortSignal,
    requestId?: string
  ): Promise<{
    text: string
    textZh?: string
    motionId?: string
    expressionId?: string
    vocabulary?: string[]
    vocabularySentences?: string[]
    studentReplyHints?: string[]
    audioBase64?: string
    scenario?: {
      id: string
      name: string
      icon: string
      targetWords: string[]
      targetWordsTotal: number
      wordsLearned: string[]
      level?: CEFRLevel
      turnsCount?: number
      maxTurns?: number
      coverageRate?: number
      stars?: 0 | 3 | 4 | 5
    }
  }> {
    const sid = sessionId ?? `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    logger.info(
      { sessionId: sid, level, scenarioId, styleName, targetLevel, resumeFrom },
      '开始课程'
    )

    // 按名称解析风格（未指定则随机）
    const requestedStyle = styleName
      ? this.persona.styles.find(s => s.name === styleName)
      : undefined

    // 若提供了 scenarioId，则开始场景化课程
    if (scenarioId) {
      return this.scenario.startScenarioLesson(
        scenarioId,
        level,
        sid,
        userId,
        requestedStyle,
        targetLevel,
        resumeFrom,
        stream,
        signal,
        requestId
      )
    }

    // 否则开始自由对话课程
    return this.freeForm.startFreeFormLesson(
      level,
      sid,
      userId,
      requestedStyle,
      stream,
      signal,
      requestId
    )
  }

  /**
   * 处理用户语音/文本输入并生成教学响应
   */
  async handleUserSpeak(
    text: string,
    options: {
      sessionId?: string
      level?: number
      stream?: boolean
      audioBase64?: string
      audioFormat?: string
      userId?: string
      requestId?: string
      signal?: AbortSignal
    } = {}
  ) {
    return this.orchestrator.handleUserSpeak(text, options)
  }

  /**
   * 解释单个词汇，用于词典弹窗。
   */
  async explainWord(word: string, sentence?: string) {
    return this.vocab.explainWord(word, sentence)
  }

  /** 获取会话信息（供 API 使用） */
  getSession(sessionId: string) {
    return this.sessions.getSessionInfo(sessionId)
  }

  /** 从缓存获取会话 */
  getSessionFromCache(sessionId: string) {
    return this.sessions.getFromCache(sessionId)
  }
}

/** 单例实例 */
export const tutorEngine = new TutorEngine()
