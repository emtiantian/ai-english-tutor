import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { CEFRLevel } from '@ai-english-tutor/shared'
import { logger } from '../logger.js'
import { broadcastToSession, onSessionDisconnect } from '../sse/handler.js'
import { tutorEngine } from '../ai/engine.js'
import type { TeacherResponseEvent, LevelResultEvent } from '../sse/types.js'

interface ChatRequestBody {
  type: 'user.speak' | 'level.check' | 'lesson.start' | 'level.assess'
  text?: string
  level?: number
  sessionId?: string
  stream?: boolean
  /** User voice audio in base64 (for voice-enabled providers) */
  audioBase64?: string
  /** Audio format when audioBase64 is provided: webm | mp4 | mp3 | wav */
  audioFormat?: string
  /** User ID for vocabulary tracking (spaced repetition) */
  userId?: string
  /** Personality style name (for lesson.start) */
  styleName?: string
  /** Scenario ID for scenario-based lessons (for lesson.start) */
  scenarioId?: string
  /** v2: CEFR target level for scenario-based lessons (for lesson.start) */
  targetLevel?: string
  /** v2: Resume a paused scenario session by its server sessionId (for lesson.start) */
  resumeFrom?: string
  /** Assessment round (1-3) for level.assess */
  round?: number
  /** Previous round scores for level.assess */
  previousScores?: number[]
  /** Topic seed for diverse assessment questions */
  topicSeed?: string
}

/**
 * Chat API routes
 * POST /api/chat - Send a message, get AI response
 *
 * Supported types:
 * - user.speak:     User input (text or voice) → AI teaching response
 * - level.check:    English level assessment
 * - lesson.start:   Start a new lesson (optionally with scenarioId)
 */
export async function chatRoutes(server: FastifyInstance): Promise<void> {
  server.post(
    '/api/chat',
    async (request: FastifyRequest<{ Body: ChatRequestBody }>, reply) => {
      const { type, text, level, sessionId, stream, audioBase64, audioFormat, userId, styleName, scenarioId, targetLevel, resumeFrom } = request.body
      logger.info(
        {
          type,
          text: text?.slice(0, 50),
          level,
          sessionId,
          stream,
          hasAudio: !!audioBase64,
          scenarioId,
          targetLevel,
          resumeFrom,
        },
        'Chat request',
      )

      try {
        switch (type) {
          case 'user.speak': {
            const controller = new AbortController()
            const onClose = () => controller.abort()

            // For streaming mode the HTTP response closes immediately; bind abort
            // to the SSE connection lifecycle instead so that LLM generation stops
            // when the client disconnects from SSE. For non-streaming mode, abort
            // when the HTTP request itself closes.
            let unsubscribeSSE: (() => void) | undefined
            if (stream && sessionId) {
              unsubscribeSSE = onSessionDisconnect(sessionId, onClose)
            } else {
              request.raw.on('close', onClose)
            }

            const enginePromise = tutorEngine.handleUserSpeak(text ?? '', {
              sessionId,
              level,
              stream: stream ?? false,
              audioBase64,
              audioFormat,
              userId,
              signal: controller.signal,
            })

            // Stream mode: data is delivered via SSE; HTTP only acknowledges acceptance
            // to avoid duplicate/out-of-order content on the client. Do not await the
            // engine here — a slow LLM would keep the HTTP request open until generation
            // finished, causing the frontend to time out and abort, which in turn aborts
            // the very generation it is waiting for and surfaces as a 500.
            if (stream) {
              enginePromise
                .catch((err) => {
                  logger.error({ err, sessionId }, 'Streaming user speak failed')
                })
                .finally(() => {
                  unsubscribeSSE?.()
                })
              return reply.status(202).send({ accepted: true })
            }

            // Non-streaming mode: await the full response and return it.
            try {
              const result = await enginePromise

              // Note: engine already broadcasts via SSE internally
              return reply.send({
                text: result.text,
                transcript: result.transcript,
                motionId: result.motionId,
                expressionId: result.expressionId,
                vocabulary: result.vocabulary,
                audioBase64: result.audioBase64,
                scenario: result.scenario,
              })
            } finally {
              request.raw.off('close', onClose)
              unsubscribeSSE?.()
            }
          }

          case 'level.check': {
            const assessment = await tutorEngine.assessLevel(text ?? '')

            const result: LevelResultEvent = {
              event: 'level.result',
              data: {
                level: assessment.level,
                reason: assessment.reason,
              },
            }

            if (sessionId) broadcastToSession(sessionId, result)
            return reply.send(result.data)
          }

          case 'lesson.start': {
            // sessionId is required — client must provide it for SSE scoping
            if (!sessionId) {
              return reply.status(400).send({ error: 'sessionId is required for lesson.start', code: 'MISSING_SESSION_ID' })
            }
            const result = await tutorEngine.startLesson(level ?? 1, sessionId, userId, scenarioId, styleName, targetLevel as CEFRLevel | undefined, resumeFrom)

            const response: TeacherResponseEvent = {
              event: 'teacher.response',
              data: {
                text: result.text,
                textZh: result.textZh,
                motionId: result.motionId,
                expressionId: result.expressionId,
                vocabulary: result.vocabulary,
                vocabularySentences: result.vocabularySentences,
                studentReplyHints: result.studentReplyHints,
                scenario: result.scenario,
              },
            }

            broadcastToSession(sessionId, response)
            return reply.send({
              text: result.text,
              textZh: result.textZh,
              motionId: result.motionId,
              expressionId: result.expressionId,
              vocabulary: result.vocabulary,
              vocabularySentences: result.vocabularySentences,
              studentReplyHints: result.studentReplyHints,
              audioBase64: result.audioBase64,
              sessionId,
              scenario: result.scenario,
            })
          }

          case 'level.assess': {
            logger.info({
              text: text?.slice(0, 50),
              hasAudio: !!audioBase64,
              audioFormat,
              audioSize: audioBase64?.length,
              round: request.body.round,
              styleName,
            }, '[Route] level.assess request received')

            const result = await tutorEngine.handleAssessmentTurn(text ?? '', {
              sessionId,
              round: request.body.round ?? 1,
              previousScores: request.body.previousScores,
              audioBase64,
              audioFormat,
              styleName,
              topicSeed: request.body.topicSeed,
            })

            return reply.send(result)
          }

          default:
            return reply.status(400).send({
              error: 'Invalid type. Expected: user.speak | level.check | lesson.start | level.assess',
              code: 'INVALID_TYPE',
            })
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Internal server error'
        const isNotFound = errorMessage.includes('not found') || errorMessage.includes('Not found')

        logger.error({ err, type }, 'Chat request failed')

        return reply.status(isNotFound ? 404 : 500).send({
          error: errorMessage,
          code: isNotFound ? 'NOT_FOUND' : 'INTERNAL_ERROR',
        })
      }
    },
  )

  /**
   * GET /api/session/:id - Get session info
   */
  server.get('/api/session/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const session = tutorEngine.getSession(request.params.id)
    if (!session) {
      return reply.status(404).send({ error: 'Session not found', code: 'SESSION_NOT_FOUND' })
    }
    return reply.send(session)
  })
}
