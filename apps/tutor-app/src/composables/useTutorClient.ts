import { onUnmounted } from 'vue'
import { TutorClient } from '../client/TutorClient'
import { useTutorStore } from '../stores/tutor'
import type { TeachingResponse } from '@ai-english-tutor/shared'

export interface TutorClientConfig {
  baseUrl?: string
  /** Callback to persist learned words to IndexedDB. Called from SSE teacher.response handler. */
  onLearnWords?: (words: string[]) => void
}

/**
 * Vue composable that initializes TutorClient and wires all events to Pinia store.
 *
 * This is the central integration point — every event from the backend
 * flows through here into reactive UI state.
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

  // Collect all unsubscribe functions for cleanup
  const unsubs: (() => void)[] = []

  // --- Server config (ttsSource etc.) ---
  unsubs.push(
    client.on('config', (serverConfig) => {
      store.ttsSource = serverConfig.ttsSource
    }),
  )

  // --- Connection events ---
  unsubs.push(
    client.on('connected', () => store.isConnected = true),
    client.on('disconnected', () => store.isConnected = false),
    client.on('error', ({ code, message }) => {
      // SSE stream errors (e.g. LLM service interrupted, reconnect exhausted)
      // can leave the UI stuck in "thinking". Reset state and surface a message.
      store.isThinking = false
      store.isPlaying = false

      // Only show a chat message for terminal / user-relevant errors to avoid
      // spamming the chat during transient reconnect attempts.
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

  // --- AI state events ---
  unsubs.push(
    client.on('state.thinking', () => store.isThinking = true),
    client.on('state.idle', () => store.isThinking = false),
  )

  // --- Message events ---
  unsubs.push(
    client.on('message.user', ({ text }) => store.addUserMessage(text)),
  )

  // --- Streaming chunks (merged: ensure streaming message exists, then append) ---
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

  // --- Complete response event ---
  unsubs.push(
    client.on('teacher.response', (response: TeachingResponse) => {
      // Update scenario progress from SSE data (before finalizeStream, so message snapshot is fresh)
      if (response.scenario) {
        store.setScenario(response.scenario)
        if (response.scenario.wordsLearned?.length) {
          onLearnWords?.(response.scenario.wordsLearned)
        }
      }

      store.finalizeStream(response)

      // Response is ready; always clear the thinking state. Empty text or
      // failed TTS won't trigger tts.start, so relying solely on audio events
      // could leave isThinking stuck forever.
      store.isThinking = false

      // Trigger character animation
      if (response.motionId) {
        store.characterProvider?.playMotion(response.motionId)
      }
      if (response.expressionId) {
        store.characterProvider?.setExpression(response.expressionId)
      }
    }),
  )

  // --- TTS events ---
  unsubs.push(
    client.on('tts.start', () => {
      store.isPlaying = true
      // Keep thinking off (already reset on teacher.response); this also covers
      // any race where audio starts before the response handler runs.
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

  // --- Level assessment ---
  unsubs.push(
    client.on('level.result', ({ level }) => { store.currentLevel = level }),
  )

  // --- Cleanup ---
  function unsubscribeAll() {
    unsubs.forEach((fn) => fn())
    client.disconnect()
  }

  onUnmounted(() => {
    unsubscribeAll()
  })

  // Auto-connect on mount
  client.connect()

  return {
    client,
    unsubscribeAll,
  }
}
