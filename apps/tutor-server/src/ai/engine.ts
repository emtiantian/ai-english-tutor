import { logger } from '../logger.js'
import { config } from '../config.js'
import { broadcastToSession } from '../sse/handler.js'
import { type CharacterPersona, type OpeningStyle, type CEFRLevel } from '@ai-english-tutor/shared'
import type {
  TeacherChunkEvent,
  TeacherResponseEvent,
  LevelResultEvent,
} from '../sse/types.js'
import { createLLMProvider, extractTextContent, type LLMMessage } from './llm.js'
import { createTTSProvider } from '../voice/tts.js'
import { createASRProvider } from '../voice/asr.js'
import {
  buildLevelAssessMessages,
  parseLevelResult,
  buildAssessmentTurnMessages,
  buildAssessmentResultMessages,
  parseAssessmentTurnResponse,
} from './prompts/level-assess.js'
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
import { loadPersona, getScenarioById } from '../vocab/loader.js'
import { pickScenarioVocabulary } from './scenario-vocab-picker.js'
import { lineGroupKey, getReusableLines, recordTeacherLine } from './line-pool.js'

/**
 * Warn when LLM response lacks `vocabularySentences`.
 *
 * The 💡 hint UI relies on these per-turn example sentences; absence is not
 * fatal (frontend degrades to showing the vocabulary list, then hides),
 * but is worth recording so we can spot prompt-compliance regressions.
 */
function warnIfMissingVocabSentences(
  parsed: { vocabulary?: string[]; vocabularySentences?: string[] },
  sessionId: string,
  origin: string,
): void {
  if (!parsed.vocabularySentences || parsed.vocabularySentences.length === 0) {
    logger.warn(
      { sessionId, origin, vocabulary: parsed.vocabulary },
      'LLM response missing vocabularySentences',
    )
  }
}

/**
 * Generate a stable, unique session ID.
 *
 * Uses a timestamp plus a random suffix to avoid collisions when the client
 * does not provide its own sessionId.
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
 * Determine which act the scenario conversation is currently in.
 *
 * Target words are split evenly across acts. We stay in an act until at least
 * half of its words have been used, then advance. This keeps the LLM focused
 * on a small, actionable batch of vocabulary each turn.
 */
function computeCurrentActIndex(scenarioState: ScenarioState): number {
  // v2: scenarios are designed around a 3-act structure. When the runtime scenario
  // does not declare acts, we still split target words into 3 buckets to keep the
  // LLM focused on a small, actionable batch each turn.
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
 * AI Teaching Engine
 *
 * Orchestrates LLM, ASR, and TTS for:
 * - Level assessment
 * - Free-form teaching conversations
 * - Scenario-based role-play lessons
 */
export class TutorEngine {
  private llm = createLLMProvider()
  private sessions = new SessionManager()
  private audio = new AudioPipeline(createTTSProvider(), createASRProvider(), this.llm)
  private vocabTracker = new VocabTracker()
  private persona: CharacterPersona = loadPersona()

  /**
   * Assess the user's English level from a sample sentence
   */
  async assessLevel(sentence: string): Promise<{ level: number; reason: string }> {
    logger.info({ sentence: sentence.slice(0, 50) }, 'Assessing English level')

    try {
      const messages = buildLevelAssessMessages(sentence, this.persona)
      const response = await this.llm.complete(messages)
      const result = parseLevelResult(response.content)

      logger.info({ level: result.level, reason: result.reason }, 'Level assessment complete')
      return { level: result.level, reason: result.reason }
    } catch (err) {
      logger.error({ err }, 'Level assessment failed, using fallback')

      const length = sentence.length
      const level = length < 20 ? 1 : length < 50 ? 2 : length < 100 ? 3 : length < 150 ? 4 : 5
      return {
        level,
        reason: `基于句子长度(${length}字符)的粗略评估`,
      }
    }
  }

  /**
   * Handle a multi-turn assessment round (1-3)
   *
   * Evaluates user text, returns scores and next question.
   * Final round computes weighted average for overall level.
   */
  async handleAssessmentTurn(
    text: string,
    options: {
      sessionId?: string
      round: number
      previousScores?: number[]
      audioBase64?: string
      audioFormat?: string
      styleName?: string
      topicSeed?: string
    },
  ): Promise<{
    round: number
    scores: { vocabulary: number; grammar: number; fluency: number; comprehension: number }
    overallLevel: number
    confidence: string
    reason: string
    transcript?: string
    nextQuestion?: string
    motionId?: string
    expressionId?: string
    audioBase64?: string
    isComplete: boolean
  }> {
    const { round, previousScores = [], audioBase64, audioFormat, styleName, topicSeed } = options

    // Resolve voiceDesign from styleName for TTS
    const voiceDesign = styleName
      ? this.persona.styles.find((s) => s.name === styleName)?.voiceDesign
      : undefined

    logger.info({
      round,
      inputText: text.slice(0, 100),
      hasAudio: !!audioBase64,
      audioFormat,
      audioSize: audioBase64?.length,
      styleName,
    }, '[Assessment] Processing turn')

    // Transcribe audio if provided
    const userText = await this.audio.transcribeAudio(text, audioBase64, audioFormat ?? 'webm')
    logger.info({ userText: userText.slice(0, 100), round }, '[Assessment] User text after transcription')

    // Detect initial trigger (text === 'start') — generate first question without evaluation
    const isInitialTrigger = userText.trim().toLowerCase() === 'start'
    if (isInitialTrigger) {
      logger.info('[Assessment] Initial trigger detected — generating first question only')
    }

    try {
      // Build assessment messages for this round
      const messages = isInitialTrigger
        ? buildAssessmentTurnMessages(1, '(Assessment just started — generate the first greeting and question only, do not evaluate)', previousScores, this.persona, topicSeed)
        : buildAssessmentTurnMessages(round, userText, previousScores, this.persona, topicSeed)

      // Voice-capable LLM: attach raw audio to the user turn (no standalone ASR ran),
      // otherwise the CEFR evaluation sees an empty answer.
      if (!isInitialTrigger && audioBase64 && this.llm.capabilities.supportsAudioInput) {
        const lastMsg = messages[messages.length - 1]
        if (lastMsg && lastMsg.role === 'user') {
          const existingText = extractTextContent(lastMsg)
          lastMsg.content = [
            { type: 'text', text: existingText || 'Please listen to the audio and respond.' },
            { type: 'audio', data: audioBase64, format: audioFormat ?? 'webm' },
          ]
          logger.info(
            { llm: this.llm.name, base64Size: audioBase64.length },
            '[Assessment] Attached audio to user turn for voice-capable LLM',
          )
        }
      }
      logger.info({
        messageCount: messages.length,
        lastUserMsg: messages.filter(m => m.role === 'user').pop()?.content?.toString().slice(0, 100),
      }, '[Assessment] Sending to LLM')

      const response = await this.llm.complete(messages)
      logger.info({ responseLength: response.content.length, preview: response.content.slice(0, 200) }, '[Assessment] LLM response')

      const parsed = parseAssessmentTurnResponse(response.content)

      // Initial trigger: return the first question with neutral scores (not a real evaluation)
      if (isInitialTrigger) {
        const firstQuestion = parsed.nextQuestion || 'Hi there! Tell me a little about yourself.'
        logger.info({ firstQuestion: firstQuestion.slice(0, 80) }, '[Assessment] First question generated')

        let audioBase64Result: string | undefined
        try {
          const audioResult = await this.audio.handleOutput(firstQuestion, voiceDesign, options.sessionId)
          audioBase64Result = audioResult.audioBase64
        } catch (err) {
          logger.warn({ err }, 'Failed to generate assessment audio')
        }

        return {
          round: 0, // round 0 = not yet started real evaluation
          scores: { vocabulary: 0, grammar: 0, fluency: 0, comprehension: 0 },
          overallLevel: 0,
          confidence: 'low',
          reason: '评估刚开始，等待学生回答',
          transcript: userText,
          nextQuestion: firstQuestion,
          motionId: parsed.motionId || 'wave',
          expressionId: parsed.expressionId || 'happy',
          audioBase64: audioBase64Result,
          isComplete: false,
        }
      }

      // Normal evaluation: calculate the overall score for this round
      const roundScore = Math.round(
        (parsed.vocabularyScore + parsed.grammarScore + parsed.fluencyScore + parsed.comprehensionScore) / 4
      )

      const isComplete = round >= 3
      let finalLevel = roundScore

      // If this is the last round, compute weighted average
      if (isComplete && previousScores.length > 0) {
        const allScores = [...previousScores, roundScore]
        // Weights: [0.2, 0.3, 0.5] for rounds 1, 2, 3
        const weights = [0.2, 0.3, 0.5]
        const weightedSum = allScores.reduce((sum, score, i) => sum + score * (weights[i] || 0.2), 0)
        finalLevel = Math.round(weightedSum)
        finalLevel = Math.min(5, Math.max(1, finalLevel))
      }

      // Generate audio for the response
      const responseText = isComplete
        ? `Based on our conversation, your English level is Level ${finalLevel}!`
        : (parsed.nextQuestion || 'Tell me more about that.')

      let audioBase64Result: string | undefined
      try {
        const audioResult = await this.audio.handleOutput(responseText, voiceDesign, options.sessionId)
        audioBase64Result = audioResult.audioBase64
      } catch (err) {
        logger.warn({ err }, 'Failed to generate assessment audio')
      }

      return {
        round,
        scores: {
          vocabulary: parsed.vocabularyScore,
          grammar: parsed.grammarScore,
          fluency: parsed.fluencyScore,
          comprehension: parsed.comprehensionScore,
        },
        overallLevel: finalLevel,
        confidence: parsed.confidence,
        reason: parsed.reason,
        transcript: userText,
        nextQuestion: isComplete ? undefined : parsed.nextQuestion,
        motionId: parsed.motionId,
        expressionId: parsed.expressionId,
        audioBase64: audioBase64Result,
        isComplete,
      }
    } catch (err) {
      logger.error({ err, round }, 'Assessment turn failed, using fallback')

      // Fallback: estimate from text length
      const length = userText.length
      const estimatedLevel = length < 30 ? 1 : length < 80 ? 2 : length < 150 ? 3 : length < 250 ? 4 : 5

      const fallbackQuestions = [
        "That's nice! Can you tell me about your favorite hobby?",
        'Interesting! Could you describe a memorable experience from last year?',
        'Imagine you had to explain to a foreign friend why your hometown is worth visiting. What would you say?',
      ]

      return {
        round,
        scores: {
          vocabulary: estimatedLevel,
          grammar: estimatedLevel,
          fluency: estimatedLevel,
          comprehension: estimatedLevel,
        },
        overallLevel: estimatedLevel,
        confidence: 'low',
        reason: '评估失败，基于回答长度估算',
        transcript: userText,
        nextQuestion: round < 3 ? fallbackQuestions[round - 1] : undefined,
        motionId: 'think',
        expressionId: 'curious',
        isComplete: round >= 3,
      }
    }
  }

  /**
   * Start a new lesson (free-form or scenario-based)
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
    logger.info({ sessionId: sid, level, scenarioId, styleName, targetLevel, resumeFrom }, 'Starting lesson')

    // Resolve style by name (or random if not specified)
    const requestedStyle = styleName
      ? this.persona.styles.find((s) => s.name === styleName)
      : undefined

    // If scenarioId is provided, start a scenario-based lesson
    if (scenarioId) {
      return this.startScenarioLesson(scenarioId, level, sid, userId, requestedStyle, targetLevel, resumeFrom)
    }

    // Otherwise, start a free-form lesson
    return this.startFreeFormLesson(level, sid, userId, requestedStyle)
  }

  /**
   * Start a scenario-based lesson
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
      throw new Error(`Scenario not found: ${scenarioId}`)
    }

    logger.info({ sessionId, scenarioId: scenario.id, scenarioName: scenario.name, targetLevel, resumeFrom }, 'Starting scenario lesson')

    try {
      // v2: determine CEFR target level
      const cefrLevel = targetLevel ?? levelNumToCEFR(level)

      let scenarioState: ScenarioState
      let isResume = false

      // v2: resume from an existing server session if resumeFrom is provided
      if (resumeFrom) {
        const existing = this.sessions.getOrCreate(resumeFrom, level)
        if (existing.scenario) {
          scenarioState = existing.scenario
          isResume = true
          logger.info({ sessionId, resumeFrom, scenarioId: scenarioState.id }, 'Resuming scenario session')
        } else {
          logger.warn({ sessionId, resumeFrom }, 'No scenario state found for resume, starting fresh')
          scenarioState = this.createScenarioState(scenario, cefrLevel)
        }
        // Ensure the current sessionId maps to the same session data
        this.sessions.set(sessionId, this.sessions.getOrCreate(resumeFrom, level))
      } else {
        scenarioState = this.createScenarioState(scenario, cefrLevel)
      }

      // Resolve the style up-front so the reusable-line group (which is keyed
      // by voice) matches what buildScenarioStartMessages will actually use.
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

      // Generate opening/resume greeting
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

      // Remember this spoken line so it can be reused (and TTS-cache-hit) later.
      await recordTeacherLine(lineGroup, parsed.text)

      // Track vocabulary
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
   * v2: create a fresh ScenarioState with CEFR-aware target words.
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
   * Start a free-form lesson
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
        'Lesson personality chosen',
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
   * Handle user speech/input and generate teaching response
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
      'Handling user speak',
    )

    const sid = sessionId ?? generateSessionId()
    const session = this.sessions.getOrCreate(sid, level)
    session.userId = userId

    // Track if input was audio (for fuzzy vocab matching)
    const isAudioInput = !!audioBase64

    // Transcribe audio if needed
    const userText = await this.audio.transcribeAudio(text, audioBase64, audioFormat)

    // Get review words (spaced repetition)
    const reviewWords = userId ? this.vocabTracker.getReviewWords(userId) : []
    const levelStr = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'][level - 1] || 'B1'

    // Build messages based on whether we're in a scenario
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

    // Voice-capable LLMs transcribe + understand audio themselves, so no
    // standalone ASR ran (transcribeAudio returned early). Attach the raw audio
    // to the last user turn here, otherwise the model only sees empty/placeholder
    // text and never actually "hears" the user.
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
          '[LLM] Attached audio to user turn for voice-capable LLM',
        )
      }
    }

    // Call LLM and finalize
    if (stream) {
      return this.handleStreamingResponse(messages, session, userText, sid, userId, reviewWords, levelStr, isAudioInput, options.signal)
    } else {
      return this.handleCompleteResponse(messages, session, userText, sid, userId, reviewWords, levelStr, isAudioInput, options.signal)
    }
  }

  // ── Private helpers ──────────────────────────────────────

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
      // Fallback: provider doesn't support streaming. Skip teacher.chunk
      // entirely — finalizeResponse will broadcast teacher.response with
      // the parsed clean text. Sending raw response.content as a chunk
      // here would leak any pre-JSON reasoning prose into the chat bubble.
      const response = await this.llm.complete(messages, signal)
      // Still send an end marker so the frontend's streaming-state UI clears.
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
        // Filter raw stream through the JSON `text` field extractor so
        // the bubble only ever sees decoded `text` content — never the
        // model's pre-JSON reasoning prose, the JSON syntax, or other
        // fields like textZh / vocabulary.
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
      'Stream filter: dropped reasoning/JSON-syntax bytes before SSE',
    )

    return this.finalizeResponse(sessionId, session, userText, chunks.join(''), userId, reviewWords, levelStr, isAudioInput)
  }

  /**
   * Shared finalization: parse → persist → broadcast SSE → handle audio → track vocab → track scenario
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

    // Track user's words in scenario using VocabTracker matching
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

      // Also count LLM-introduced target words as encountered
      if (parsed.vocabulary) {
        const targetSet = new Set(session.scenario.targetWords.map(w => w.toLowerCase()))
        for (const word of parsed.vocabulary) {
          if (targetSet.has(word.toLowerCase())) {
            session.scenario.wordsUsed.add(word.toLowerCase())
          }
        }
        // Filter vocabulary to only include target words (avoid LLM hallucinations)
        parsed.vocabulary = parsed.vocabulary.filter(w => targetSet.has(w.toLowerCase()))
        if (parsed.vocabulary.length === 0) parsed.vocabulary = undefined
      }

      // Persist updated scenario progress so it survives server restarts.
      try {
        this.sessions.saveScenarioState(sessionId, session.scenario)
      } catch (err) {
        logger.warn({ err, sessionId }, 'Failed to persist scenario state')
      }
    }

    this.sessions.addMessage(sessionId, session, 'user', userText)
    this.sessions.addMessage(sessionId, session, 'assistant', parsed.text, {
      motionId: parsed.motionId,
      expressionId: parsed.expressionId,
      vocabulary: parsed.vocabulary,
    })

    // Remember the spoken line for reuse (only inside a scenario, where the
    // pool is grouped by scenario/level/voice and the prompt offers it back).
    if (session.scenario) {
      const targetLevel = session.scenario.level ?? levelNumToCEFR(session.level)
      await recordTeacherLine(
        lineGroupKey(session.scenario.id, targetLevel, session.voiceDesign),
        parsed.text,
      )
    }

    // Track vocabulary (spaced repetition)
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
        }, 'Vocabulary tracking update')
      }
    }

    const scenarioProgress = this.buildScenarioProgress(session)
    const completeEvent: TeacherResponseEvent = {
      event: 'teacher.response',
      data: { ...parsed, scenario: scenarioProgress },
    }
    broadcastToSession(sessionId, completeEvent)

    // Generate English TTS
    const audioResult = await this.audio.handleOutput(parsed.text, session.voiceDesign, sessionId)

    return {
      ...parsed,
      transcript: userText,
      audioBase64: audioResult.audioBase64,
      scenario: scenarioProgress,
    }
  }

  /**
   * Build scenario progress response (v2: coverage + turns + maxTurns + stars)
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
      logger.info({ scenarioId: scenario.id, turnsCount: scenario.turnsCount, coverage, stars }, 'Scenario completed!')
    }

    return result
  }

  /**
   * Build scenario response for lesson start (initial state)
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

  /** Get session info (for API) */
  getSession(sessionId: string) {
    return this.sessions.getSessionInfo(sessionId)
  }

  /** Get session from cache */
  getSessionFromCache(sessionId: string) {
    return this.sessions.getFromCache(sessionId)
  }
}

/** Singleton instance */
export const tutorEngine = new TutorEngine()
