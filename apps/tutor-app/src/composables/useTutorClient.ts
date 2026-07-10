import { onUnmounted } from 'vue'
import { TutorClient } from '../client/TutorClient'
import { useTutorStore } from '../stores/tutor'
import type { TeachingResponse } from '@ai-english-tutor/shared'

export interface TutorClientConfig {
  baseUrl?: string
  /** 将学会的单词持久化到 IndexedDB 的回调。由 SSE teacher.response 处理器调用。 */
  onLearnWords?: (words: string[]) => void
}

/**
 * 初始化 TutorClient 并将所有事件连接到 Pinia store 的 Vue composable。
 *
 * 这是核心集成点——后端的每个事件都从这里流入响应式 UI 状态。
 */
export function useTutorClient(config?: TutorClientConfig) {
  const store = useTutorStore()

  const baseUrl = config?.baseUrl ?? import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000'

  const client = new TutorClient({
    baseUrl,
    sessionId: store.connectionId,
    autoReconnect: true,
  })

  const onLearnWords = config?.onLearnWords

  // 收集所有取消订阅函数以便清理
  const unsubs: (() => void)[] = []

  // --- 服务器配置（ttsSource 等）---
  unsubs.push(
    client.on('config', (serverConfig) => {
      store.ttsSource = serverConfig.ttsSource
    }),
  )

  // --- 连接事件 ---
  unsubs.push(
    client.on('connected', () => store.isConnected = true),
    client.on('disconnected', () => store.isConnected = false),
    client.on('error', ({ code, message }) => {
      // SSE 流错误（例如 LLM 服务中断、重连耗尽）
      // 可能让 UI 卡在“思考中”。重置状态并展示一条消息。
      store.isThinking = false
      store.isPlaying = false

      // 仅对终端/用户相关错误显示聊天消息，
      // 避免在短暂重连尝试期间刷屏。
      if (code === 'RECONNECT_EXHAUSTED') {
        store.messages.push({
          id: `msg-${Date.now()}`,
          role: 'assistant',
          text: message || '连接已断开，请刷新页面重试',
          timestamp: Date.now(),
        })
      }
    }),
  )

  // --- AI 状态事件 ---
  unsubs.push(
    client.on('state.thinking', () => store.isThinking = true),
    client.on('state.idle', () => store.isThinking = false),
  )

  // --- 消息事件 ---
  unsubs.push(
    client.on('message.user', ({ text }) => store.addUserMessage(text)),
  )

  // --- 流式片段（合并：确保流式消息存在，然后追加）---
  unsubs.push(
    client.on('teacher.chunk', ({ chunk, isEnd }) => {
      if (isEnd) return
      const msgs = store.messages
      const last = msgs[msgs.length - 1]
      if (!last || last.role !== 'assistant' || !last.isStreaming) {
        store.startAssistantStream()
      }
      store.appendStreamChunk(chunk)
    }),
  )

  // --- 完整回复事件 ---
  unsubs.push(
    client.on('teacher.response', (response: TeachingResponse) => {
      // 从 SSE 数据更新场景进度（在 finalizeStream 之前，使消息快照保持最新）
      if (response.scenario) {
        store.setScenario(response.scenario)
        if (response.scenario.wordsLearned?.length) {
          onLearnWords?.(response.scenario.wordsLearned)
        }
      }

      store.finalizeStream(response)

      // 回复已就绪；始终清除思考状态。空文本或
      // TTS 失败不会触发 tts.start，因此仅依赖音频事件
      // 可能让 isThinking 永远卡住。
      store.isThinking = false

      // 触发角色动画
      if (response.motionId) {
        store.characterProvider?.playMotion(response.motionId)
      }
      if (response.expressionId) {
        store.characterProvider?.setExpression(response.expressionId)
      }
    }),
  )

  // --- TTS 事件 ---
  unsubs.push(
    client.on('tts.start', () => {
      store.isPlaying = true
      // 保持思考状态关闭（已在 teacher.response 时重置）；这也覆盖
      // 音频在响应处理器运行前就开始的竞态情况。
      store.isThinking = false
    }),
    client.on('tts.end', () => {
      store.isPlaying = false
      // 兜底：TTS 结束时也确保 thinking 状态已关闭
      store.isThinking = false
      // 如果开关关闭，语音结束后显示延迟的文本
      if (!store.showTextImmediately) {
        store.showDelayedMessage()
      }
    }),
  )

  // --- 清理 ---
  function unsubscribeAll() {
    unsubs.forEach((fn) => fn())
    client.disconnect()
  }

  onUnmounted(() => {
    unsubscribeAll()
  })

  // 挂载时自动连接
  client.connect()

  return {
    client,
    unsubscribeAll,
  }
}
