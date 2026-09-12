import type { CharacterPersona } from '@ai-english-tutor/shared'
import { LUNA_PERSONA } from '@ai-english-tutor/shared'
import { logger } from '../../logger.js'
import { getScenarioById } from '../../vocab/loader.js'
import type { AudioPipeline } from '../audio-pipeline.js'
import type { LLMProvider } from '../llm.js'
import { buildScenarioStartMessages, pickOpeningStyle } from '../prompts/teaching.js'
import { parseCompleteTeachingResponse } from '../response/complete-teaching-response.js'
import {
  streamTeachingResponse,
  warnIfMissingVocabSentences
} from '../response/response-orchestrator.js'
import { pickScenarioVocabulary, DEFAULT_TARGET_COUNT } from '../scenario-vocab-picker.js'
import { SessionManager, type ScenarioState } from '../session-manager.js'
import { levelNumToCEFR } from '../utils/cefr.js'
import { broadcastToSession } from '../../sse/handler.js'
import type { TeacherResponseEvent } from '../../sse/types.js'

export class ScenarioEngine {
  constructor(
    private llm: LLMProvider,
    private sessions: SessionManager,
    private audio: AudioPipeline,
    private persona: CharacterPersona = LUNA_PERSONA
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
      level: cefrLevel,
      targetWords: pickScenarioVocabulary(scenario, cefrLevel, DEFAULT_TARGET_COUNT),
      wordsUsed: new Set()
    }
    const style = pickOpeningStyle(this.persona)
    const { messages } = buildScenarioStartMessages(
      scenario,
      level,
      cefrLevel,
      style,
      this.persona,
      state.targetWords
    )
    const session = this.sessions.getOrCreate(sessionId, level)
    session.history = []
    session.vocabulary.clear()
    session.openingStyle = style
    session.voiceDesign = voiceDesign
    session.scenario = state

    logger.info({ sessionId, scenarioId, cefrLevel }, '开始场景对话')
    const raw = stream
      ? await streamTeachingResponse(this.llm, messages, sessionId, signal, requestId)
      : (await this.llm.complete(messages, signal)).content
    const parsed = await parseCompleteTeachingResponse(raw, this.llm, signal)
    warnIfMissingVocabSentences(parsed, sessionId, 'startScenarioLesson')
    this.sessions.addMessage(sessionId, session, 'assistant', parsed.text, parsed)

    const scenarioResponse = this.toResponse(state)
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

  private toResponse(state: ScenarioState) {
    return {
      id: state.id,
      name: state.name,
      icon: state.icon,
      targetWords: state.targetWords,
      targetWordsTotal: state.targetWords.length,
      wordsLearned: Array.from(state.wordsUsed)
    }
  }
}
