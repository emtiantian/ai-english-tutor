import { logger } from '../../logger.js'
import { broadcastToSession } from '../../sse/handler.js'
import type { TeacherChunkEvent, TeacherResponseEvent } from '../../sse/types.js'
import type { CEFRLevel, CharacterPersona } from '@ai-english-tutor/shared'
import { extractTextContent, type LLMMessage } from '../llm.js'
import type { LLMProvider } from '../llm.js'
import type { AudioPipeline } from '../audio-pipeline.js'
import { SessionManager, type SessionData } from '../session-manager.js'
import { VocabTracker, type ReviewWord } from '../vocab-tracker.js'
import { parseTeachingResponse } from '../response-parser.js'
import { JsonTextStreamExtractor } from '../stream-text-extractor.js'
import {
  buildTeachingMessages,
  buildScenarioTeachingMessages,
} from '../prompts/teaching.js'
import { lineGroupKey, getReusableLines, recordTeacherLine } from '../line-pool.js'
import { getScenarioById } from '../../vocab/loader.js'
import { levelNumToCEFR } from '../utils/cefr.js'
import { computeCurrentActIndex, buildScenarioProgress } from '../utils/scenario-progress.js'

/**
 * 当 LLM 响应缺少 `vocabularySentences` 时发出警告。
 *
 * 💡 提示 UI 依赖每轮提供的例句；缺失不会导致崩溃（前端会降级为显示词汇列表，然后隐藏），
 * 但值得记录下来，以便发现 prompt 遵循度回退。
 */
export function warnIfMissingVocabSentences(
  parsed: { vocabulary?: string[]; vocabularySentences?: string[] },
  sessionId: string,
  origin: string,
): void {
  // 按 prompt 约定：vocabulary 为空时允许省略 vocabularySentences，
  // 只在有词汇却缺少例句时报警，避免正常空回复也刷 WARN。
  if (
    parsed.vocabulary &&
    parsed.vocabulary.length > 0 &&
    (!parsed.vocabularySentences || parsed.vocabularySentences.length === 0)
  ) {
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

export class ResponseOrchestrator {
  constructor(
    private llm: LLMProvider,
    private sessions: SessionManager,
    private audio: AudioPipeline,
    private vocabTracker: VocabTracker,
    private persona: CharacterPersona,
  ) {}

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
    const levelStr = levelNumToCEFR(level)

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
        scenarioState.levelProfile,
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

  private async handleCompleteResponse(
    messages: LLMMessage[],
    session: SessionData,
    userText: string,
    sessionId: string,
    userId?: string,
    reviewWords?: ReviewWord[],
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
    reviewWords?: ReviewWord[],
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
    reviewWords?: ReviewWord[],
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
      vocabularySentences: parsed.vocabularySentences,
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

    const scenarioProgress = buildScenarioProgress(session)
    const completeEvent: TeacherResponseEvent = {
      event: 'teacher.response',
      data: { ...parsed, scenario: scenarioProgress },
    }
    broadcastToSession(sessionId, completeEvent)

    // 生成英文 TTS
    logger.debug(
      { sessionId, textLength: parsed.text.length, hasVoiceDesign: !!session.voiceDesign },
      '准备生成 TTS',
    )
    const audioResult = await this.audio.handleOutput(parsed.text, session.voiceDesign, sessionId)

    return {
      ...parsed,
      transcript: userText,
      audioBase64: audioResult.audioBase64,
      scenario: scenarioProgress,
    }
  }
}
