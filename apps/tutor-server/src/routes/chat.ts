import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { CEFRLevel } from '@ai-english-tutor/shared'
import { logger } from '../logger.js'
import { broadcastToSession, onSessionDisconnect } from '../sse/handler.js'
import { tutorEngine } from '../ai/engine.js'
import type { TeacherResponseEvent } from '../sse/types.js'

interface ChatRequestBody {
  type: 'user.speak' | 'lesson.start'
  text?: string
  level?: number
  sessionId?: string
  stream?: boolean
  /** 用户语音音频，base64 编码（供支持语音的 provider 使用） */
  audioBase64?: string
  /** 提供 audioBase64 时的音频格式：webm | mp4 | mp3 | wav */
  audioFormat?: string
  /** 用户 ID，用于词汇跟踪（间隔重复） */
  userId?: string
  /** 人格风格名称（用于 lesson.start） */
  styleName?: string
  /** 场景化课程 ID（用于 lesson.start） */
  scenarioId?: string
  /** v2：场景化课程的目标 CEFR 等级（用于 lesson.start） */
  targetLevel?: string
  /** v2：通过服务端 sessionId 恢复暂停的场景会话（用于 lesson.start） */
  resumeFrom?: string
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
    const {
      type,
      text,
      level,
      sessionId,
      stream,
      audioBase64,
      audioFormat,
      userId,
      styleName,
      scenarioId,
      targetLevel,
      resumeFrom
    } = request.body
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
        resumeFrom
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
            unsubscribeSSE = onSessionDisconnect(sessionId, onClose)
          } else {
            request.raw.on('close', onClose)
          }

          const enginePromise = tutorEngine.startLesson(
            level ?? 1,
            sessionId,
            userId,
            scenarioId,
            styleName,
            targetLevel as CEFRLevel | undefined,
            resumeFrom,
            stream ?? false,
            controller.signal
          )

          // 流式模式：数据通过 SSE 推送；HTTP 仅确认接收。
          if (stream) {
            enginePromise
              .catch(err => {
                logger.error({ err, sessionId }, 'Streaming lesson.start failed')
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
