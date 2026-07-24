import { onUnmounted, unref } from 'vue'
import type { Ref } from 'vue'
import { TutorClient } from '../client/TutorClient'
import { useTutorStore } from '../stores/tutor'
import type { TeachingResponse } from '@ai-english-tutor/shared'
import type { CharacterProvider } from '@ai-english-tutor/shared'
import { createMessageId } from '../lib/message-utils.js'

export interface TutorClientConfig {
  baseUrl?: string
  /** 将学会的单词持久化到 IndexedDB 的回调。由 SSE teacher.response 处理器调用。 */
  onLearnWords?: (words: string[]) => void
  /** 角色 Provider 实例，用于触发动作/表情。 */
  characterProvider?: Ref<CharacterProvider | null> | CharacterProvider | null
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
    autoReconnect: true
  })

  const onLearnWords = config?.onLearnWords

  // 收集所有取消订阅函数以便清理
  const unsubs: (() => void)[] = []

  // --- 服务器配置（ttsSource 等）---
  unsubs.push(
    client.on('config', serverConfig => {
      store.ttsSource = serverConfig.ttsSource
    })
  )

  // --- 连接事件 ---
  unsubs.push(
    client.on('connected', () => (store.isConnected = true)),
    client.on('disconnected', () => (store.isConnected = false)),
    client.on('error', ({ code, message }) => {
      // SSE 流错误（例如 LLM 服务中断、重连耗尽）
      // 可能让 UI 卡在“思考中”。重置状态并展示一条消息。
      store.isThinking = false
      store.isPlaying = false

      // 仅对终端/用户相关错误显示聊天消息，
      // 避免在短暂重连尝试期间刷屏。
      if (code === 'RECONNECT_EXHAUSTED') {
        store.messages.push({
          id: createMessageId(),
          role: 'assistant',
          text: message || '连接已断开，请刷新页面重试',
          timestamp: Date.now()
        })
      }
    })
  )

  // --- AI 状态事件 ---
  unsubs.push(client.on('state.thinking', () => (store.isThinking = true)))

  // --- 消息事件 ---
  unsubs.push(client.on('message.user', ({ text }) => store.addUserMessage(text)))

  // --- 流式片段（合并：确保流式消息存在，然后追加）---
  unsubs.push(
    client.on('teacher.chunk', ({ chunk, isEnd }) => {
      // 打断后忽略同代请求还在路上的 in-flight 文本分片；新请求代不同则正常流式
      if (store.interrupted && store.interruptedAtEpoch === store.requestEpoch) return
      if (isEnd) return
      const msgs = store.messages
      const last = msgs[msgs.length - 1]
      if (!last || last.role !== 'assistant' || !last.isStreaming) {
        store.startAssistantStream()
      }
      store.appendStreamChunk(chunk)
    })
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
      // 回复完成，清掉打断态（下次请求的流式不再受抑制）
      store.interrupted = false

      // 回复已就绪；始终清除思考状态。
      // isThinking 不依赖音频回调——空回复或 TTS 失败时音频事件可能不触发，
      // 所以在这里显式重置，避免 UI 卡在“思考中”。
      store.isThinking = false

      // 触发角色动画
      const provider = unref(config?.characterProvider)
      if (response.motionId) {
        provider?.playMotion?.(response.motionId)
      }
      if (response.expressionId) {
        provider?.setExpression?.(response.expressionId)
      }
    })
  )

  // 注：打断态由前端 interruptTeacher 本地驱动（store.markStreamingInterrupted），
  // 不监听后端 teacher.interrupted——其异步到达会与新请求 chunk 竞态、误定稿新回复。
  // 后端 teacher.interrupted 仅作 abort 信号，前端无需消费。

  // 注：isPlaying / showDelayedMessage / setSpeaking 全部由 useAudioPlayback 统一驱动
  // （AudioPlayer.onStart/onEnd/onVolume 是音频生命周期的唯一来源，覆盖 local/remote
  // TTS 与重听）。此处不再监听 tts.start/tts.end，避免与播放器回调重复设置状态。

  // --- 清理 ---
  function unsubscribeAll() {
    unsubs.forEach(fn => fn())
    client.disconnect()
  }

  onUnmounted(() => {
    unsubscribeAll()
  })

  // 挂载时自动连接
  client.connect()

  return {
    client,
    unsubscribeAll
  }
}
