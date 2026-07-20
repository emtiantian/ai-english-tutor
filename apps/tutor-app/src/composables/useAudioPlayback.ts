import { onUnmounted, watch } from 'vue'
import type { Ref } from 'vue'
import type { CharacterProvider } from '@ai-english-tutor/shared'
import type { TutorClient } from '../client/TutorClient'
import { useTutorStore } from '../stores/tutor'
import { AudioPlayer } from '../audio/player'

/**
 * 管理 AudioPlayer 生命周期，并将 TutorClient SSE 流与播放器事件连接起来的 composable。
 */
export function useAudioPlayback(
  client: TutorClient,
  characterProvider?: Ref<CharacterProvider | null> | CharacterProvider | null,
) {
  const store = useTutorStore()
  const audioPlayer = new AudioPlayer(store.ttsSource)

  // 使 AudioPlayer 与服务器驱动的 ttsSource 保持同步（配置 SSE 事件可能在播放器创建后才到达，
  // 因此当真实来源已知时需要更新初始的 'local' 默认值）。
  watch(
    () => store.ttsSource,
    (source) => {
      audioPlayer.setTTSSource(source)
    },
    { immediate: true },
  )

  // 将播放器事件连接到状态与角色 provider。
  // AudioPlayer.onStart/onEnd/onVolume 是音频生命周期的唯一来源
  // （local/remote TTS、重听都走这里），因此 isPlaying、setSpeaking、
  // setMouthOpen、延迟显示文本统一在此驱动，不再走 tts.start/tts.end 事件链。
  const getProvider = () => (characterProvider && 'value' in characterProvider ? characterProvider.value : characterProvider)

  audioPlayer.onStart = () => {
    store.isPlaying = true
    getProvider()?.setSpeaking?.(true)
  }
  audioPlayer.onEnd = () => {
    store.isPlaying = false
    getProvider()?.setSpeaking?.(false)
    // 如果开关关闭，语音结束后显示延迟的文本
    if (!store.showTextImmediately) {
      store.showDelayedMessage()
    }
  }
  audioPlayer.onVolume = (volume) => {
    getProvider()?.setMouthOpen?.(volume)
  }

  // 将远程音频片段连接到播放器
  // 按消息跟踪片段，避免不同回复之间相互污染
  let pendingAudioChunks: string[] = []
  let audioTargetMsgId: string | null = null

  // 将待处理音频刷入目标消息（辅助函数）
  // 若音频已保存则返回 true，若尚未找到消息则返回 false（保留片段）
  function flushPendingAudio(): boolean {
    if (pendingAudioChunks.length === 0) return true

    // 查找目标消息：使用已捕获的 ID，或回退到最后一条助手消息
    let msg = audioTargetMsgId
      ? store.messages.find(m => m.id === audioTargetMsgId)
      : null
    if (!msg) {
      // 回退：查找最后一条助手消息（处理音频片段比消息更早到达的竞态条件）
      for (let i = store.messages.length - 1; i >= 0; i--) {
        if (store.messages[i].role === 'assistant') {
          msg = store.messages[i]
          break
        }
      }
    }

    if (msg) {
      msg.audioBase64 = pendingAudioChunks.join('')
      pendingAudioChunks = []
      audioTargetMsgId = null
      return true
    }

    // 还没有消息——先保留片段，稍后再处理（watch 会再次调用）
    return false
  }

  // 当新助手消息出现时（通过 startAssistantStream），
  // 将前一条回复的待处理音频刷入，以避免相互污染。
  watch(
    () => store.messages.length,
    (newLen, oldLen) => {
      if (newLen > oldLen) {
        const lastMsg = store.messages[newLen - 1]
        if (lastMsg?.role === 'assistant') {
          flushPendingAudio()
        }
      }
    },
  )

  client.on('teacher.audio', (chunk) => {
    if (store.ttsSource === 'remote') {
      audioPlayer.feedAudioChunk(chunk)
      pendingAudioChunks.push(chunk.audioBase64)

      // 在回复的第一个音频片段上捕获目标消息 ID
      if (!audioTargetMsgId) {
        const msgs = store.messages
        const last = msgs[msgs.length - 1]
        if (last?.role === 'assistant') {
          audioTargetMsgId = last.id
        }
      }

      if (chunk.isEnd) {
        flushPendingAudio()
      }
    }
  })

  // 将助手消息连接到本地 TTS 播放
  client.on('message.assistant', (response) => {
    if (store.ttsSource === 'local') {
      audioPlayer.speak(response.text)
    }
  })

  /**
   * 为 iOS Safari 解锁音频。必须从用户手势中调用。
   */
  async function unlockAudio(): Promise<void> {
    await audioPlayer.unlockAudio()
  }

  function replayAudio(audioBase64: string) {
    audioPlayer.replayAudio(audioBase64)
  }

  // 页面卸载/刷新时停止音频，防止刷新后继续播放
  const stopOnUnload = () => audioPlayer.stop()
  window.addEventListener('beforeunload', stopOnUnload)

  onUnmounted(() => {
    window.removeEventListener('beforeunload', stopOnUnload)
    audioPlayer.stop()
  })

  return { audioPlayer, unlockAudio, replayAudio }
}
