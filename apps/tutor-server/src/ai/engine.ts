import { logger } from '../logger.js'
import { config } from '../config.js'
import { broadcastToSession } from '../sse/handler.js'
import { type CharacterPersona, type OpeningStyle, type CEFRLevel } from '@ai-english-tutor/shared'
import type {
  TeacherChunkEvent,
  TeacherResponseEvent,
} from '../sse/types.js'
import { createLLMProvider, extractTextContent, type LLMMessage } from './llm.js'
import { createTTSProvider } from '../voice/tts.js'
import { createASRProvider } from '../voice/asr.js'
import {
  buildLessonStartMessages,
  buildTeachingMessages,
  buildScenarioStartMessages,
  buildScenarioTeachingMessages,
  pickOpeningStyle,
} from './prompts/teaching.js'
import { SessionManager, type SessionData, type ScenarioState } from './session-manager.js'
import { AudioPipeline } from './audio-pipeline.js'
import { parseTeachingResponse } from './response-parser.js'
import { JsonTextStreamExtractor } from './stream-text-extractor.js'
import { VocabTracker } from './vocab-tracker.js'
import { loadPersona, getScenarioById, lookupWord } from '../vocab/loader.js'
import {
  buildVocabExplainMessages,
  parseVocabExplainResponse,
  type WordExplanation,
} from './prompts/vocab-explain.js'
import { pickScenarioVocabulary } from './scenario-vocab-picker.js'
import { lineGroupKey, getReusableLines, recordTeacherLine } from './line-pool.js'

/**
 * 当 LLM 响应缺少 `vocabularySentences` 时发出警告。
 *
 * 💡 提示 UI 依赖每轮提供的例句；缺失不会导致崩溃（前端会降级为显示词汇列表，然后隐藏），
 * 但值得记录下来，以便发现 prompt 遵循度回退。
 */
function warnIfMissingVocabSentences(
  parsed: { vocabulary?: string[]; vocabularySentences?: string[] },
  sessionId: string,
  origin: string,
): void {
  if (!parsed.vocabularySentences || parsed.vocabularySentences.length === 0) {
    logger.warn(
      { sessionId, origin, vocabulary: parsed.vocabulary },
      'LLM 响应缺少 vocabularySentences',
    )
  }
}

/**
 * 生成稳定、唯一的 session ID。
 *
 * 使用时间戳加随机后缀，避免客户端未提供自己的 sessionId 时发生冲突。
 */
function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const CEFR_LEVELS: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const DEFAULT_MAX_TURNS = 20

function levelNumToCEFR(level: number): CEFRLevel {
  return CEFR_LEVELS[Math.min(Math.max(level - 1, 0), CEFR_LEVELS.length - 1)] ?? 'A1'
}

function computeCoverage(wordsUsed: number, total: number): number {
  if (!total) return 0
  return Math.min(1, wordsUsed / total)
}

function computeStars(coverage: number): 0 | 3 | 4 | 5 {
  if (coverage >= 0.9) return 5
  if (coverage >= 0.75) return 4
  if (coverage >= 0.6) return 3
  return 0
}

function isScenarioComplete(turnsCount: number, coverage: number): boolean {
  return turnsCount >= DEFAULT_MAX_TURNS || (turnsCount >= 6 && coverage >= 0.6)
}

/**
 * 判断场景对话当前处于哪一幕。
 *
 * 目标词汇被均匀分配到三幕中。每一幕至少要使用一半以上词汇才会进入下一幕，
 * 这样每轮都能让 LLM 专注于一小批可执行的词汇。
 */
function computeCurrentActIndex(scenarioState: ScenarioState): number {
  // v2: 场景围绕三幕结构设计。运行时场景未声明幕时，仍将目标词汇分成 3 份，
  // 让 LLM 每轮只关注一小批可执行的词汇。
  const actsCount = 3
  const bucketSize = Math.ceil(scenarioState.targetWords.length / actsCount)
  if (bucketSize <= 0) return 0

  const usedSet = scenarioState.wordsUsed
  for (let i = 0; i < actsCount - 1; i++) {
    const bucket = scenarioState.targetWords.slice(i * bucketSize, (i + 1) * bucketSize)
    const usedInBucket = bucket.filter((w) => usedSet.has(w.toLowerCase())).length
    if (usedInBucket / bucket.length < 0.5) return i
  }
  return actsCount - 1
}

/**
 * AI 教学引擎
 *
 * 编排 LLM、ASR 与 TTS，支持：
 * - 英语水平评估
 * - 自由对话教学
 * - 场景化角色扮演教学
 */
export class TutorEngine {
  private llm = createLLMProvider()
  private sessions = new SessionManager()
  private audio = new AudioPipeline(createTTSProvider(), createASRProvider(), this.llm)
  private vocabTracker = new VocabTracker()
  private persona: CharacterPersona = loadPersona()

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
    const sid = sessionId ?? generateSessionId()
    logger.info({ sessionId: sid, level, scenarioId, styleName, targetLevel, resumeFrom }, '开始课程')

    // 按名称解析风格（未指定则随机）
    const requestedStyle = styleName
      ? this.persona.styles.find((s) => s.name === styleName)
      : undefined

    // 若提供了 scenarioId，则开始场景化课程
    if (scenarioId) {
      return this.startScenarioLesson(scenarioId, level, sid, userId, requestedStyle, targetLevel, resumeFrom)
    }

    // 否则开始自由对话课程
    return this.startFreeFormLesson(level, sid, userId, requestedStyle)
  }

  /**
   * 开始场景化课程
   */
  private async startScenarioLesson(
    scenarioId: string,
    level: number,
    sessionId: string,
    userId?: string,
    style?: OpeningStyle,
    targetLevel?: CEFRLevel,
    resumeFrom?: string,
  ) {
    const scenario = getScenarioById(scenarioId)
    if (!scenario) {
      throw new Error(`场景不存在：${scenarioId}`)
    }

    logger.info({ sessionId, scenarioId: scenario.id, scenarioName: scenario.name, targetLevel, resumeFrom }, '开始场景化课程')

    try {
      // v2: 确定 CEFR 目标等级
      const cefrLevel = targetLevel ?? levelNumToCEFR(level)

      let scenarioState: ScenarioState
      let isResume = false

      // v2: 若提供了 resumeFrom，则从已有服务端会话恢复
      if (resumeFrom) {
        const existing = this.sessions.getOrCreate(resumeFrom, level)
        if (existing.scenario) {
          scenarioState = existing.scenario
          isResume = true
          logger.info({ sessionId, resumeFrom, scenarioId: scenarioState.id }, '恢复场景会话')
        } else {
          logger.warn({ sessionId, resumeFrom }, '未找到可恢复的场景状态，重新开始')
          scenarioState = this.createScenarioState(scenario, cefrLevel)
        }
        // 确保当前 sessionId 指向同一份会话数据
        this.sessions.set(sessionId, this.sessions.getOrCreate(resumeFrom, level))
      } else {
        scenarioState = this.createScenarioState(scenario, cefrLevel)
      }

      // 提前确定风格，使可复用台词组（按音色分组）与 buildScenarioStartMessages 实际使用的音色一致。
      const resolvedStyle = style ?? pickOpeningStyle(this.persona)
      const lineGroup = lineGroupKey(scenario.id, cefrLevel, resolvedStyle.voiceDesign)
      const reusableLines = await getReusableLines(lineGroup)

      const { messages: startMessages, style: chosenStyle } = buildScenarioStartMessages(scenario, level, cefrLevel, resolvedStyle, this.persona, reusableLines, scenarioState.targetWords)

      const session = this.sessions.getOrCreate(sessionId, level)
      session.userId = userId
      session.openingStyle = chosenStyle
      session.voiceDesign = chosenStyle.voiceDesign
      session.scenario = scenarioState

      this.sessions.saveSessionToDb(sessionId, level, chosenStyle.name, chosenStyle.voiceDesign)
      this.sessions.saveScenarioState(sessionId, scenarioState)

      // 生成开场/恢复问候
      const userPrompt = isResume
        ? `The student is returning to the role-play scenario: "${scenario.nameEn}". ` +
          `Welcome them back naturally and continue the conversation as ${scenario.role.teacher}. ` +
          `Current progress: ${scenarioState.turnsCount} turns, ${scenarioState.wordsUsed.size}/${scenarioState.targetWords.length} target words used. ` +
          `Do NOT explain the objectives — just continue in character.`
        : `The student is starting a role-play scenario: "${scenario.nameEn}". ` +
          `Setting: ${scenario.setting} ` +
          `Begin the scenario naturally. Introduce the setting and your role in character. ` +
          `Do NOT explain the objectives — just start the conversation as if it's really happening.`

      const messages: LLMMessage[] = [
        { role: 'system', content: startMessages[0].content },
        { role: 'user', content: userPrompt },
      ]

      const response = await this.llm.complete(messages)
      const parsed = parseTeachingResponse(response.content)
      warnIfMissingVocabSentences(parsed, sessionId, isResume ? 'resumeScenarioLesson' : 'startScenarioLesson')

      this.sessions.addMessage(sessionId, session, 'assistant', parsed.text, {
        motionId: parsed.motionId,
        expressionId: parsed.expressionId,
        vocabulary: parsed.vocabulary,
        vocabularySentences: parsed.vocabularySentences,
      })

      // 记住这句台词，便于后续复用（并命中 TTS 缓存）。
      await recordTeacherLine(lineGroup, parsed.text)

      // 跟踪词汇
      if (userId && parsed.vocabulary?.length) {
        const levelStr = cefrLevel
        this.vocabTracker.processTurn(
          userId, '', parsed.vocabulary, [], levelStr,
        )
      }

      const audioResult = await this.audio.handleOutput(parsed.text, session.voiceDesign, sessionId)

      return {
        ...parsed,
        audioBase64: audioResult.audioBase64,
        scenario: this.buildScenarioResponse(scenarioState),
      }
    } catch (err) {
      logger.error({ err }, 'Scenario start failed, using fallback')
      const fallbackWords = scenario.targetWords.slice(0, 6)
      return {
        text: `Welcome to the "${scenario.name}" scenario! Let's practice together.`,
        motionId: 'wave',
        expressionId: 'happy',
        vocabulary: fallbackWords.slice(0, 3),
        scenario: {
          id: scenario.id,
          name: scenario.name,
          icon: scenario.icon,
          targetWords: fallbackWords,
          targetWordsTotal: fallbackWords.length,
          wordsLearned: [],
          level: targetLevel ?? levelNumToCEFR(level),
          turnsCount: 0,
          maxTurns: DEFAULT_MAX_TURNS,
          coverageRate: 0,
          stars: 0 as 0 | 3 | 4 | 5,
        },
      }
    }
  }

  /**
   * v2: 创建新的 ScenarioState，目标词汇根据 CEFR 等级筛选。
   */
  private createScenarioState(scenario: ReturnType<typeof getScenarioById>, level: CEFRLevel): ScenarioState {
    const targetWords = scenario ? pickScenarioVocabulary(scenario, level) : []
    return {
      id: scenario?.id ?? 'unknown',
      name: scenario?.name ?? 'Unknown',
      icon: scenario?.icon ?? '',
      level,
      targetWords,
      maxTurns: DEFAULT_MAX_TURNS,
      objectives: (scenario?.objectives ?? []).map((obj) => ({
        id: obj.id,
        description: obj.description,
        descriptionEn: obj.descriptionEn,
        keywords: obj.keywords,
        targetWords: obj.targetWords ?? [],
      })),
      turnsCount: 0,
      wordsUsed: new Set(),
    }
  }

  /**
   * 开始自由对话课程
   */
  private async startFreeFormLesson(level: number, sessionId: string, userId?: string, style?: OpeningStyle) {
    try {
      const { messages, style: chosenStyle } = buildLessonStartMessages(level, style, this.persona)

      const session: SessionData = {
        level,
        history: [],
        vocabulary: new Set(),
        openingStyle: chosenStyle,
        voiceDesign: chosenStyle.voiceDesign,
        userId,
      }
      this.sessions.set(sessionId, session)

      logger.info(
        { sessionId, style: chosenStyle.name },
        '课程人格已选择',
      )

      this.sessions.saveSessionToDb(sessionId, level, chosenStyle.name, chosenStyle.voiceDesign)

      const response = await this.llm.complete(messages)
      const parsed = parseTeachingResponse(response.content)
      warnIfMissingVocabSentences(parsed, sessionId, 'startFreeFormLesson')

      this.sessions.addMessage(sessionId, session, 'assistant', parsed.text, {
        motionId: parsed.motionId,
        expressionId: parsed.expressionId,
        vocabulary: parsed.vocabulary,
        vocabularySentences: parsed.vocabularySentences,
      })

      const audioResult = await this.audio.handleOutput(parsed.text, session.voiceDesign, sessionId)

      return { ...parsed, audioBase64: audioResult.audioBase64 }
    } catch (err) {
      logger.error({ err }, 'Lesson start failed, using fallback')
      return {
        text: `Welcome to Level ${level}! I'm excited to teach you today.`,
        motionId: 'wave',
        expressionId: 'happy',
        vocabulary: ['welcome', 'excited', 'teach'],
      }
    }
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
      signal?: AbortSignal
    } = {},
  ): Promise<{
    text: string
    transcript?: string
    motionId?: string
    expressionId?: string
    vocabulary?: string[]
    audioBase64?: string
    scenario?: {
      id: string
      name: string
      icon: string
      targetWords: string[]
      targetWordsTotal: number
      wordsLearned: string[]
      completed?: boolean
      level?: CEFRLevel
      turnsCount?: number
      maxTurns?: number
      coverageRate?: number
      stars?: 0 | 3 | 4 | 5
      summary?: { wordsUsed: string[]; wordsTotal: number; turnsCount: number }
    }
  }> {
    const {
      sessionId,
      level = 3,
      stream = false,
      audioBase64,
      audioFormat = 'webm',
      userId,
    } = options

    logger.info(
      {
        text: text.slice(0, 50),
        sessionId,
        level,
        stream,
        hasAudio: !!audioBase64,
        provider: this.llm.name,
        hasScenario: !!sessionId && !!this.sessions.getFromCache(sessionId)?.scenario,
      },
      '处理用户发言',
    )

    const sid = sessionId ?? generateSessionId()
    const session = this.sessions.getOrCreate(sid, level)
    session.userId = userId

    // 记录输入是否为音频（用于模糊词汇匹配）
    const isAudioInput = !!audioBase64

    // 按需转录音频
    const userText = await this.audio.transcribeAudio(text, audioBase64, audioFormat)

    // 获取复习词（间隔重复）
    const reviewWords = userId ? this.vocabTracker.getReviewWords(userId) : []
    const levelStr = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'][level - 1] || 'B1'

    // 根据是否处于场景中构建消息
    let messages: LLMMessage[]
    const scenarioState = session.scenario
    const scenario = scenarioState ? getScenarioById(scenarioState.id) : undefined
    if (scenario && scenarioState) {
      const targetLevel = scenarioState.level ?? levelNumToCEFR(session.level)
      const reusableLines = await getReusableLines(
        lineGroupKey(scenario.id, targetLevel, session.voiceDesign),
      )
      messages = buildScenarioTeachingMessages(
        userText,
        scenario,
        session.level,
        targetLevel,
        session.history,
        session.openingStyle,
        this.persona,
        reviewWords.length > 0 ? reviewWords : undefined,
        reusableLines,
        scenarioState.targetWords,
        {
          currentActIndex: computeCurrentActIndex(scenarioState),
          wordsUsed: Array.from(scenarioState.wordsUsed),
        },
      )
    } else {
      messages = buildTeachingMessages(
        userText,
        session.level,
        session.history,
        session.openingStyle,
        this.persona,
        reviewWords.length > 0 ? reviewWords : undefined,
      )
    }

    // 支持音频输入的 LLM 可自行转录并理解音频，因此没有跑独立 ASR（transcribeAudio 提前返回）。
    // 在此处把原始音频附加到最后一条用户轮次，否则模型只能看到空/占位文本，无法真正“听到”用户。
    if (isAudioInput && audioBase64 && this.llm.capabilities.supportsAudioInput) {
      const lastMsg = messages[messages.length - 1]
      if (lastMsg && lastMsg.role === 'user') {
        const existingText = extractTextContent(lastMsg)
        lastMsg.content = [
          { type: 'text', text: existingText || 'Please listen to the audio and respond.' },
          { type: 'audio', data: audioBase64, format: audioFormat },
        ]
        logger.info(
          { llm: this.llm.name, audioFormat, base64Size: audioBase64.length },
          '[LLM] 已为支持语音的 LLM 附加音频到用户轮次',
        )
      }
    }

    // 调用 LLM 并收尾
    if (stream) {
      return this.handleStreamingResponse(messages, session, userText, sid, userId, reviewWords, levelStr, isAudioInput, options.signal)
    } else {
      return this.handleCompleteResponse(messages, session, userText, sid, userId, reviewWords, levelStr, isAudioInput, options.signal)
    }
  }

  // ── 私有辅助方法 ──────────────────────────────────────

  private async handleCompleteResponse(
    messages: LLMMessage[],
    session: SessionData,
    userText: string,
    sessionId: string,
    userId?: string,
    reviewWords?: import('./vocab-tracker.js').ReviewWord[],
    levelStr?: string,
    isAudioInput?: boolean,
    signal?: AbortSignal,
  ) {
    const response = await this.llm.complete(messages, signal)
    return this.finalizeResponse(sessionId, session, userText, response.content, userId, reviewWords, levelStr, isAudioInput)
  }

  private async handleStreamingResponse(
    messages: LLMMessage[],
    session: SessionData,
    userText: string,
    sessionId: string,
    userId?: string,
    reviewWords?: import('./vocab-tracker.js').ReviewWord[],
    levelStr?: string,
    isAudioInput?: boolean,
    signal?: AbortSignal,
  ) {
    const chunks: string[] = []
    const extractor = new JsonTextStreamExtractor()
    let rawBytes = 0
    let visibleBytes = 0

    if (!this.llm.stream) {
      // 降级方案：provider 不支持流式。完全跳过 teacher.chunk — finalizeResponse 会广播
      // teacher.response 并附带解析后的干净文本。若在此把原始 response.content 当作 chunk
      // 发送，会把 JSON 前的推理文本泄漏到聊天气泡中。
      const response = await this.llm.complete(messages, signal)
      // 仍发送结束标记，让前端的流式状态 UI 清空。
      broadcastToSession(sessionId, {
        event: 'teacher.chunk',
        data: { chunk: '', isEnd: true },
      } satisfies TeacherChunkEvent)
      return this.finalizeResponse(sessionId, session, userText, response.content, userId, reviewWords, levelStr, isAudioInput)
    }

    for await (const chunk of this.llm.stream(messages, { signal })) {
      if (chunk.content) {
        chunks.push(chunk.content)
        rawBytes += chunk.content.length
        // 通过 JSON `text` 字段提取器过滤原始流，使气泡只展示解码后的 `text` 内容 —
        // 绝不包含模型 JSON 前的推理文本、JSON 语法或其他字段（如 textZh / vocabulary）。
        const visible = extractor.push(chunk.content)
        if (visible) {
          visibleBytes += visible.length
          const event: TeacherChunkEvent = {
            event: 'teacher.chunk',
            data: { chunk: visible, isEnd: false },
          }
          broadcastToSession(sessionId, event)
        }
      }
      if (chunk.isEnd) {
        const tail = extractor.flush()
        if (tail) {
          visibleBytes += tail.length
          broadcastToSession(sessionId, {
            event: 'teacher.chunk',
            data: { chunk: tail, isEnd: false },
          } satisfies TeacherChunkEvent)
        }
        broadcastToSession(sessionId, {
          event: 'teacher.chunk',
          data: { chunk: '', isEnd: true },
        } satisfies TeacherChunkEvent)
        break
      }
    }

    logger.debug(
      { sessionId, rawBytes, visibleBytes, droppedBytes: rawBytes - visibleBytes },
      '流式过滤：在 SSE 前丢弃推理/JSON 语法字节',
    )

    return this.finalizeResponse(sessionId, session, userText, chunks.join(''), userId, reviewWords, levelStr, isAudioInput)
  }

  /**
   * 统一收尾：解析 → 持久化 → 广播 SSE → 处理音频 → 跟踪词汇 → 跟踪场景
   */
  private async finalizeResponse(
    sessionId: string,
    session: SessionData,
    userText: string,
    rawContent: string,
    userId?: string,
    reviewWords?: import('./vocab-tracker.js').ReviewWord[],
    levelStr?: string,
    isAudioInput?: boolean,
  ) {
    const parsed = parseTeachingResponse(rawContent)
    warnIfMissingVocabSentences(parsed, sessionId, 'handleUserSpeak')

    // 在场景中使用 VocabTracker 匹配跟踪用户使用的词汇
    if (session.scenario) {
      session.scenario.turnsCount++
      const { used } = this.vocabTracker.analyzeUserText(
        userText,
        session.scenario.targetWords,
        { isAudioInput },
      )
      for (const word of used) {
        session.scenario.wordsUsed.add(word)
      }

      // LLM 引入的目标词汇也视为已遇到
      if (parsed.vocabulary) {
        const targetSet = new Set(session.scenario.targetWords.map(w => w.toLowerCase()))
        for (const word of parsed.vocabulary) {
          if (targetSet.has(word.toLowerCase())) {
            session.scenario.wordsUsed.add(word.toLowerCase())
          }
        }
        // 将 vocabulary 过滤为仅保留目标词汇（避免 LLM 幻觉）
        parsed.vocabulary = parsed.vocabulary.filter(w => targetSet.has(w.toLowerCase()))
        if (parsed.vocabulary.length === 0) parsed.vocabulary = undefined
      }

      // 持久化更新后的场景进度，使其在服务端重启后仍能保留。
      try {
        this.sessions.saveScenarioState(sessionId, session.scenario)
      } catch (err) {
        logger.warn({ err, sessionId }, '持久化场景状态失败')
      }
    }

    this.sessions.addMessage(sessionId, session, 'user', userText)
    this.sessions.addMessage(sessionId, session, 'assistant', parsed.text, {
      motionId: parsed.motionId,
      expressionId: parsed.expressionId,
      vocabulary: parsed.vocabulary,
    })

    // 记住这句台词以复用（仅在场景中生效，台词池按场景/等级/音色分组，并在 prompt 中回传）。
    if (session.scenario) {
      const targetLevel = session.scenario.level ?? levelNumToCEFR(session.level)
      await recordTeacherLine(
        lineGroupKey(session.scenario.id, targetLevel, session.voiceDesign),
        parsed.text,
      )
    }

    // 跟踪词汇（间隔重复）
    if (userId && reviewWords && levelStr) {
      const vocabAnalysis = this.vocabTracker.processTurn(
        userId, userText, parsed.vocabulary ?? [], reviewWords, levelStr,
        { isAudioInput },
      )
      if (vocabAnalysis.usedWords.length > 0 || vocabAnalysis.newWords.length > 0) {
        logger.info({
          userId,
          isAudio: isAudioInput,
          used: vocabAnalysis.usedWords,
          missed: vocabAnalysis.missedWords,
          new: vocabAnalysis.newWords,
        }, '词汇跟踪更新')
      }
    }

    const scenarioProgress = this.buildScenarioProgress(session)
    const completeEvent: TeacherResponseEvent = {
      event: 'teacher.response',
      data: { ...parsed, scenario: scenarioProgress },
    }
    broadcastToSession(sessionId, completeEvent)

    // 生成英文 TTS
    const audioResult = await this.audio.handleOutput(parsed.text, session.voiceDesign, sessionId)

    return {
      ...parsed,
      transcript: userText,
      audioBase64: audioResult.audioBase64,
      scenario: scenarioProgress,
    }
  }

  /**
   * 构建场景进度响应（v2: 覆盖率 + 轮数 + 最大轮数 + 星级）
   */
  private buildScenarioProgress(session: SessionData) {
    if (!session.scenario) return undefined

    const scenario = session.scenario
    const wordsLearned = Array.from(scenario.wordsUsed)
    const coverage = computeCoverage(wordsLearned.length, scenario.targetWords.length)
    const stars = computeStars(coverage)
    const completed = isScenarioComplete(scenario.turnsCount, coverage)

    const result: {
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
      completed?: boolean
      summary?: { wordsUsed: string[]; wordsTotal: number; turnsCount: number }
    } = {
      id: scenario.id,
      name: scenario.name,
      icon: scenario.icon,
      targetWords: scenario.targetWords,
      targetWordsTotal: scenario.targetWords.length,
      wordsLearned,
      level: scenario.level,
      turnsCount: scenario.turnsCount,
      maxTurns: scenario.maxTurns,
      coverageRate: coverage,
      stars,
      completed,
    }

    if (completed) {
      result.summary = {
        wordsUsed: wordsLearned,
        wordsTotal: scenario.targetWords.length,
        turnsCount: scenario.turnsCount,
      }
      logger.info({ scenarioId: scenario.id, turnsCount: scenario.turnsCount, coverage, stars }, '场景完成！')
    }

    return result
  }

  /**
   * 构建课程开始时的场景响应（初始状态）
   */
  private buildScenarioResponse(scenario: ScenarioState) {
    return {
      id: scenario.id,
      name: scenario.name,
      icon: scenario.icon,
      targetWords: scenario.targetWords,
      targetWordsTotal: scenario.targetWords.length,
      wordsLearned: [],
      level: scenario.level,
      turnsCount: scenario.turnsCount,
      maxTurns: scenario.maxTurns,
      coverageRate: 0,
      stars: 0 as 0 | 3 | 4 | 5,
    }
  }

  /**
   * 解释单个词汇，用于词典弹窗。
   *
   * 优先使用 LLM（可覆盖任意对话词汇，给出上下文相关的释义），静态词汇库作为离线/失败兜底。
   * 仅当两者都无法给出可用解释时返回 null。
   */
  async explainWord(word: string, sentence?: string): Promise<WordExplanation | null> {
    const cleaned = word.trim()
    if (!cleaned) return null

    const staticEntry = lookupWord(cleaned)
    const hint = staticEntry
      ? { level: staticEntry.level, meaning: staticEntry.data.meaning, pos: staticEntry.data.pos }
      : undefined

    try {
      const messages = buildVocabExplainMessages(cleaned, sentence, hint)
      const response = await this.llm.complete(messages)
      const parsed = parseVocabExplainResponse(response.content, cleaned)
      if (parsed) {
        if (!parsed.level && staticEntry) parsed.level = staticEntry.level
        return parsed
      }
    } catch (err) {
      logger.error({ err, word: cleaned }, 'explainWord LLM 失败，使用静态词典兜底')
    }

    if (staticEntry) {
      return {
        word: staticEntry.data.word,
        level: staticEntry.level,
        senses: [{ pos: staticEntry.data.pos, meaningZh: staticEntry.data.meaning }],
      }
    }
    return null
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
