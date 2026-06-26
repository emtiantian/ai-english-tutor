import { onUnmounted, watch } from 'vue'
import type { TutorClient } from '../client/TutorClient'
import { useTutorStore } from '../stores/tutor'
import { AudioPlayer } from '../audio/player'

/**
 * Composable that manages AudioPlayer lifecycle and wires events
 * between the TutorClient SSE stream and the player.
 */
export function useAudioPlayback(client: TutorClient) {
  const store = useTutorStore()
  const audioPlayer = new AudioPlayer(store.ttsSource)

  // Keep AudioPlayer in sync with server-driven ttsSource (config SSE event may
  // arrive after the player is created, so the initial 'local' default must be
  // updated when the real source is known).
  watch(
    () => store.ttsSource,
    (source) => {
      audioPlayer.setTTSSource(source)
    },
    { immediate: true },
  )

  // Wire audio player events → client events
  audioPlayer.onStart = () => client.emit('tts.start', { text: '', source: store.ttsSource })
  audioPlayer.onEnd = () => client.emit('tts.end', { source: store.ttsSource })
  audioPlayer.onVolume = (volume) => {
    store.characterProvider?.setMouthOpen(volume)
  }

  // Wire remote audio chunks → player
  // Track chunks per message to avoid cross-contamination between responses
  let pendingAudioChunks: string[] = []
  let audioTargetMsgId: string | null = null

  // Flush pending audio to its target message (helper)
  // Returns true if audio was saved, false if no message found yet (chunks preserved)
  function flushPendingAudio(): boolean {
    if (pendingAudioChunks.length === 0) return true

    // Find target message: use captured ID, or fall back to last assistant message
    let msg = audioTargetMsgId
      ? store.messages.find(m => m.id === audioTargetMsgId)
      : null
    if (!msg) {
      // Fallback: find the last assistant message (handles race condition where
      // audio chunks arrived before the message was created)
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

    // No message yet — keep chunks for later (watch will call us again)
    return false
  }

  // When a new assistant message appears (via startAssistantStream),
  // flush any pending audio from the previous response to prevent cross-contamination.
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

      // Capture the target message ID on first chunk of a response
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

  // Wire assistant messages → local TTS playback
  client.on('message.assistant', (response) => {
    if (store.ttsSource === 'local') {
      audioPlayer.speak(response.text)
    }
  })

  /**
   * Unlock audio for iOS Safari. Must be called from a user gesture.
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
