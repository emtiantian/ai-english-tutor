/**
 * 自由形式教学引擎：无固定场景，按等级自由对话。
 */
import { logger } from '../../logger.js'
import type { CharacterPersona, OpeningStyle } from '@ai-english-tutor/shared'
import type { LLMProvider } from '../llm.js'
import type { AudioPipeline } from '../audio-pipeline.js'
import { SessionManager, type SessionData } from '../session-manager.js'
import { buildLessonStartMessages } from '../prompts/teaching.js'
import { parseTeachingResponse } from '../response-parser.js'
import { warnIfMissingVocabSentences } from '../response/response-orchestrator.js'

export class FreeFormEngine {
  constructor(
    private llm: LLMProvider,
    private sessions: SessionManager,
    private audio: AudioPipeline,
    private persona: CharacterPersona,
  ) {}

  async startFreeFormLesson(level: number, sessionId: string, userId?: string, style?: OpeningStyle) {
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
  }
}
