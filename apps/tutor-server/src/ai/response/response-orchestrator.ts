import type { CharacterPersona } from '@ai-english-tutor/shared'
import { LUNA_PERSONA } from '@ai-english-tutor/shared'
import { logger } from '../../logger.js'
import { broadcastToSession } from '../../sse/handler.js'
import type { TeacherChunkEvent, TeacherResponseEvent } from '../../sse/types.js'
import { getScenarioById } from '../../vocab/loader.js'
import type { AudioPipeline } from '../audio-pipeline.js'
import type { LLMMessage, LLMProvider } from '../llm.js'
import { buildScenarioTeachingMessages } from '../prompts/teaching.js'
import { parseCompleteTeachingResponse } from './complete-teaching-response.js'
import type { SessionData } from '../session-manager.js'
import { SessionManager } from '../session-manager.js'
import { JsonTextStreamExtractor } from '../stream-text-extractor.js'

export function warnIfMissingVocabSentences(
  parsed: { vocabulary?: string[]; vocabularySentences?: string[] },
  sessionId: string,
  origin: string
): void {
  if (parsed.vocabulary?.length && !parsed.vocabularySentences?.length) {
    logger.warn(
      { sessionId, origin, vocabulary: parsed.vocabulary },
      'LLM 响应缺少 vocabularySentences'
    )
  }
}

export async function streamTeachingResponse(
  llm: LLMProvider,
  messages: LLMMessage[],
  sessionId: string,
  signal?: AbortSignal,
  requestId?: string
): Promise<string> {
  if (!llm.stream) {
    const response = await llm.complete(messages, signal)
    broadcastToSession(sessionId, {
      event: 'teacher.chunk',
      data: { chunk: '', isEnd: true, requestId }
    } satisfies TeacherChunkEvent)
    return response.content
  }

  const chunks: string[] = []
  const extractor = new JsonTextStreamExtractor()
  for await (const chunk of llm.stream(messages, { signal })) {
    if (chunk.content) {
      chunks.push(chunk.content)
      const visible = extractor.push(chunk.content)
      if (visible)
        broadcastToSession(sessionId, {
          event: 'teacher.chunk',
          data: { chunk: visible, isEnd: false, requestId }
        } satisfies TeacherChunkEvent)
    }
    if (chunk.isEnd) {
      const tail = extractor.flush()
      if (tail)
        broadcastToSession(sessionId, {
          event: 'teacher.chunk',
          data: { chunk: tail, isEnd: false, requestId }
        } satisfies TeacherChunkEvent)
      broadcastToSession(sessionId, {
        event: 'teacher.chunk',
        data: { chunk: '', isEnd: true, requestId }
      } satisfies TeacherChunkEvent)
    }
  }
  return chunks.join('')
}

export class ResponseOrchestrator {
  constructor(
    private llm: LLMProvider,
    private sessions: SessionManager,
    private audio: AudioPipeline,
    private persona: CharacterPersona = LUNA_PERSONA
  ) {}

  async handleUserSpeak(
    text: string,
    options: {
      sessionId?: string
      level?: number
      stream?: boolean
      requestId?: string
      signal?: AbortSignal
    } = {}
  ) {
    const sessionId = options.sessionId
    if (!sessionId) throw new Error('场景对话缺少 sessionId')
    const session = this.sessions.getFromCache(sessionId)
    if (!session?.scenario) throw new Error('场景会话不存在，请重新选择场景')
    const scenario = getScenarioById(session.scenario.id)
    if (!scenario) throw new Error(`场景不存在：${session.scenario.id}`)

    const messages = buildScenarioTeachingMessages(
      text,
      scenario,
      session.level,
      session.scenario.level,
      session.history,
      session.openingStyle,
      this.persona,
      session.scenario.targetWords,
      { wordsUsed: Array.from(session.scenario.wordsUsed) }
    )
    const raw = options.stream
      ? await streamTeachingResponse(
          this.llm,
          messages,
          sessionId,
          options.signal,
          options.requestId
        )
      : (await this.llm.complete(messages, options.signal)).content
    return this.finalize(sessionId, session, text, raw, options.signal, options.requestId)
  }

  private async finalize(
    sessionId: string,
    session: SessionData,
    userText: string,
    raw: string,
    signal?: AbortSignal,
    requestId?: string
  ) {
    const parsed = await parseCompleteTeachingResponse(raw, this.llm, signal)
    warnIfMissingVocabSentences(parsed, sessionId, 'handleUserSpeak')
    this.recordUsedWords(session, userText)
    this.sessions.addMessage(sessionId, session, 'user', userText)
    this.sessions.addMessage(sessionId, session, 'assistant', parsed.text, parsed)

    const scenario = session.scenario && {
      id: session.scenario.id,
      name: session.scenario.name,
      icon: session.scenario.icon,
      targetWords: session.scenario.targetWords,
      targetWordsTotal: session.scenario.targetWords.length,
      wordsLearned: Array.from(session.scenario.wordsUsed)
    }
    broadcastToSession(sessionId, {
      event: 'teacher.response',
      data: { ...parsed, scenario, requestId }
    } satisfies TeacherResponseEvent)
    const audio = await this.audio.handleOutput(
      parsed.text,
      session.voiceDesign,
      sessionId,
      requestId,
      signal
    )
    return { ...parsed, transcript: userText, ...audio, scenario }
  }

  private recordUsedWords(session: SessionData, text: string): void {
    if (!session.scenario) return
    const normalized = text.toLowerCase()
    for (const word of session.scenario.targetWords) {
      const escaped = word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (new RegExp(`\\b${escaped}\\b`, 'i').test(normalized)) session.scenario.wordsUsed.add(word)
    }
  }
}
