import { logger } from '../../logger.js'
import { getScenarioById } from '../../vocab/loader.js'
import type { AudioPipeline } from '../audio-pipeline.js'
import type { LLMProvider } from '../llm.js'
import { buildScenarioStartMessages } from '../prompts/teaching.js'
import { parseCompleteTeachingResponse } from '../response/complete-teaching-response.js'
import {
  streamTeachingResponse,
  warnIfMissingVocabSentences,
  ensureReplyVocabulary
} from '../response/response-orchestrator.js'
import { SessionManager, type ScenarioState } from '../session-manager.js'
import { levelNumToCEFR } from '../utils/cefr.js'
import { broadcastToSession } from '../../sse/handler.js'
import type { TeacherResponseEvent } from '../../sse/types.js'

export class ScenarioEngine {
  constructor(
    private llm: LLMProvider,
    private sessions: SessionManager,
    private audio: AudioPipeline
  ) {}

  async startScenarioLesson(
    scenarioId: string,
    level: number,
    sessionId: string,
    voiceDesign?: string,
    stream = false,
    signal?: AbortSignal,
    requestId?: string
  ) {
    const scenario = getScenarioById(scenarioId)
    if (!scenario) throw new Error(`场景不存在：${scenarioId}`)

    const cefrLevel = levelNumToCEFR(level)
    const state: ScenarioState = {
      id: scenario.id,
      name: scenario.name,
      icon: scenario.icon,
      level: cefrLevel
    }
    const { messages } = buildScenarioStartMessages(scenario, level, cefrLevel)
    const session = this.sessions.getOrCreate(sessionId, level)
    session.history = []
    session.vocabulary.clear()
    session.voiceDesign = voiceDesign
    session.scenario = state

    logger.info({ sessionId, scenarioId, cefrLevel }, '开始场景对话')
    const raw = stream
      ? await streamTeachingResponse(this.llm, messages, sessionId, signal, requestId, true)
      : (await this.llm.complete(messages, signal, { responseFormat: 'json' })).content
    const parsed = ensureReplyVocabulary(
      await parseCompleteTeachingResponse(raw, this.llm, signal),
      session.vocabulary
    )
    warnIfMissingVocabSentences(parsed, sessionId, 'startScenarioLesson')
    this.sessions.addMessage(sessionId, session, 'assistant', parsed.text, parsed)

    const scenarioResponse = this.toResponse(state, session.vocabulary)
    if (stream) {
      broadcastToSession(sessionId, {
        event: 'teacher.response',
        data: { ...parsed, scenario: scenarioResponse, requestId }
      } satisfies TeacherResponseEvent)
    }
    const audio = await this.audio.handleOutput(
      parsed.text,
      voiceDesign,
      sessionId,
      requestId,
      signal
    )
    return { ...parsed, ...audio, scenario: scenarioResponse }
  }

  private toResponse(state: ScenarioState, annotated: Set<string>) {
    return {
      id: state.id,
      name: state.name,
      icon: state.icon,
      targetWords: [],
      targetWordsTotal: 0,
      wordsLearned: Array.from(annotated)
    }
  }
}
