import type { FastifyInstance, FastifyRequest } from 'fastify'
import { logger } from '../logger.js'
import { broadcastToSession, interruptSession, onSessionDisconnect } from '../sse/handler.js'
import { tutorEngine } from '../ai/engine.js'
import type { ErrorEvent, TeacherInterruptedEvent, TeacherResponseEvent } from '../sse/types.js'

function reportStreamingFailure(
  sessionId: string | undefined,
  requestId: string | undefined,
  err: unknown
): void {
  if (!sessionId) return
  const message = err instanceof Error ? err.message : '生成回复失败'
  broadcastToSession(sessionId, {
    event: 'error',
    data: { code: 'STREAM_FAILED', message, requestId }
  } satisfies ErrorEvent)
}

interface ChatRequestBody {
  type: 'user.speak' | 'lesson.start'
  text?: string
  level?: number
  sessionId?: string
  /** 单次生成请求 ID，用于打断和过滤迟到事件 */
  requestId?: string
  stream?: boolean
  /** 场景化课程 ID（用于 lesson.start） */
  scenarioId?: string
  /** 用户选择的小米 Voice Design 描述；与场景无关。 */
  voiceDesign?: string
}

/**
 * 聊天 API 路由
 * POST /api/chat - 发送消息，获取 AI 回复
 *
 * 支持的类型：
 * - user.speak:     用户输入（文字或语音）→ AI 教学回复
 * - lesson.start:   开始新课程（可选 scenarioId）
 */
export async function chatRoutes(server: FastifyInstance): Promise<void> {
  server.post('/api/chat', async (request: FastifyRequest<{ Body: ChatRequestBody }>, reply) => {
    if (!request.body || typeof request.body !== 'object') {
      return reply.status(400).send({ error: 'JSON body is required', code: 'INVALID_BODY' })
    }
    const { type, text, level, sessionId, requestId, stream, scenarioId, voiceDesign } =
      request.body
    if (text !== undefined && typeof text !== 'string') {
      return reply.status(400).send({ error: 'text must be a string', code: 'INVALID_TEXT' })
    }
    if (level !== undefined && (!Number.isInteger(level) || level < 1 || level > 6)) {
      return reply
        .status(400)
        .send({ error: 'level must be an integer from 1 to 6', code: 'INVALID_LEVEL' })
    }
    if (type === 'user.speak' && !text?.trim()) {
      return reply.status(400).send({
        error: 'text is required for user.speak',
        code: 'MISSING_INPUT'
      })
    }
    logger.info(
      {
        type,
        text: text?.slice(0, 50),
        level,
        sessionId,
        stream,
        scenarioId,
        hasVoiceDesign: !!voiceDesign
      },
      'Chat request'
    )

    try {
      switch (type) {
        case 'user.speak': {
          const controller = new AbortController()
          const onClose = () => controller.abort()

          // 流式模式下 HTTP 响应会立即关闭；改为把 abort 绑定到 SSE 连接
          // 生命周期，这样客户端断开 SSE 时 LLM 生成也会停止。非流式模式
          // 则在 HTTP 请求本身关闭时 abort。
          let unsubscribeSSE: (() => void) | undefined
          if (stream && sessionId) {
            unsubscribeSSE = onSessionDisconnect(sessionId, onClose, requestId)
          } else {
            request.raw.on('close', onClose)
          }

          const enginePromise = tutorEngine.handleUserSpeak(text ?? '', {
            sessionId,
            level,
            stream: stream ?? false,
            requestId,
            signal: controller.signal
          })

          // 流式模式：数据通过 SSE 推送；HTTP 仅确认接收，避免客户端收到
          // 重复或乱序内容。不要在这里 await engine——慢 LLM 会让 HTTP 请求
          // 一直等到生成结束，导致前端超时并 abort，而 abort 又会中断它正在
          // 等待的生成过程，最终以 500 报错。
          if (stream) {
            enginePromise
              .catch(err => {
                logger.error({ err, sessionId }, 'Streaming user speak failed')
                if (!controller.signal.aborted) reportStreamingFailure(sessionId, requestId, err)
              })
              .finally(() => {
                unsubscribeSSE?.()
              })
            return reply.status(202).send({ accepted: true })
          }

          // 非流式模式：等待完整响应并返回。
          try {
            const result = await enginePromise

            // 注意：engine 内部已经通过 SSE 广播
            return reply.send({
              text: result.text,
              transcript: result.transcript,
              motionId: result.motionId,
              expressionId: result.expressionId,
              vocabulary: result.vocabulary,
              vocabularySentences: result.vocabularySentences,
              studentReplyHints: result.studentReplyHints,
              audioBase64: result.audioBase64,
              scenario: result.scenario
            })
          } finally {
            request.raw.off('close', onClose)
            unsubscribeSSE?.()
          }
        }

        case 'lesson.start': {
          // sessionId 必填——客户端必须提供，用于 SSE 作用域划分
          if (!sessionId) {
            return reply
              .status(400)
              .send({ error: 'sessionId is required for lesson.start', code: 'MISSING_SESSION_ID' })
          }

          const controller = new AbortController()
          const onClose = () => controller.abort()
          let unsubscribeSSE: (() => void) | undefined
          if (stream && sessionId) {
            unsubscribeSSE = onSessionDisconnect(sessionId, onClose, requestId)
          } else {
            request.raw.on('close', onClose)
          }

          if (!scenarioId) {
            return reply.status(400).send({
              error: 'scenarioId is required for lesson.start',
              code: 'MISSING_SCENARIO_ID'
            })
          }
          const enginePromise = tutorEngine.startLesson(
            level ?? 1,
            sessionId,
            scenarioId,
            voiceDesign,
            stream ?? false,
            controller.signal,
            requestId
          )

          // 流式模式：数据通过 SSE 推送；HTTP 仅确认接收。
          if (stream) {
            enginePromise
              .catch(err => {
                logger.error({ err, sessionId }, 'Streaming lesson.start failed')
                if (!controller.signal.aborted) reportStreamingFailure(sessionId, requestId, err)
              })
              .finally(() => {
                unsubscribeSSE?.()
              })
            return reply.status(202).send({ accepted: true })
          }

          // 非流式模式：等待完整响应并返回。
          try {
            const result = await enginePromise

            const response: TeacherResponseEvent = {
              event: 'teacher.response',
              data: {
                requestId,
                text: result.text,
                textZh: result.textZh,
                motionId: result.motionId,
                expressionId: result.expressionId,
                vocabulary: result.vocabulary,
                vocabularySentences: result.vocabularySentences,
                studentReplyHints: result.studentReplyHints,
                scenario: result.scenario
              }
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
              scenario: result.scenario
            })
          } finally {
            request.raw.off('close', onClose)
            unsubscribeSSE?.()
          }
        }

        default:
          return reply.status(400).send({
            error: 'Invalid type. Expected: user.speak | lesson.start',
            code: 'INVALID_TYPE'
          })
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Internal server error'
      const isNotFound = errorMessage.includes('not found') || errorMessage.includes('Not found')

      logger.error({ err, type }, 'Chat request failed')

      return reply.status(isNotFound ? 404 : 500).send({
        error: errorMessage,
        code: isNotFound ? 'NOT_FOUND' : 'INTERNAL_ERROR'
      })
    }
  })

  /**
   * POST /api/chat/interrupt - 用户打断当前老师回复
   *
   * 触发当前 session 正在进行的 LLM 生成 abort（复用 SSE 断开监听器，不断开 SSE），
   * 随后广播 teacher.interrupted 事件让前端清理流式残留。
   * 用于“用户开口/打字时让老师闭嘴”的最小打断场景。
   */
  server.post(
    '/api/chat/interrupt',
    async (
      request: FastifyRequest<{ Body: { sessionId?: string; requestId?: string } }>,
      reply
    ) => {
      const { sessionId, requestId } = request.body ?? {}
      if (!sessionId) {
        return reply
          .status(400)
          .send({ error: 'sessionId is required', code: 'MISSING_SESSION_ID' })
      }
      // 仅当确实有正在进行的请求被打断时才广播 teacher.interrupted，
      // 避免无在跑请求时（如老师只 TTS 在播、或已空闲）误触发前端打断态、
      // 抑制用户紧接着的新回复流式。
      const had = interruptSession(sessionId, requestId)
      if (had) {
        broadcastToSession(sessionId, {
          event: 'teacher.interrupted',
          data: { reason: 'user', requestId }
        } satisfies TeacherInterruptedEvent)
      }
      return reply.send({ ok: true })
    }
  )

  /**
   * GET /api/session/:id - 获取会话信息
   */
  server.get(
    '/api/session/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const session = tutorEngine.getSession(request.params.id)
      if (!session) {
        return reply.status(404).send({ error: 'Session not found', code: 'SESSION_NOT_FOUND' })
      }
      return reply.send(session)
    }
  )
}
