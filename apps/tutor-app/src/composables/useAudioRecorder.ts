import { onUnmounted, ref, type Ref } from 'vue'
import type { CharacterProvider } from '@ai-english-tutor/shared'
import type { TutorClient } from '../client/TutorClient.js'
import type { ChatRequestBody, ChatResponse } from '../client/types.js'
import { isBrowserASRSupported, recognizeSpeech } from '../audio/browser-asr.js'
import { createMessageId } from '../lib/message-utils.js'
import { useTutorStore } from '../stores/tutor.js'

/** Browser SpeechRecognition lifecycle for the first-release voice input. */
export function useAudioRecorder(
  client: TutorClient,
  sendToBackend: (
    payload: Partial<ChatRequestBody> & { type: ChatRequestBody['type'] }
  ) => Promise<ChatResponse>,
  _asrProvider?: () => string,
  characterProvider?: Ref<CharacterProvider | null> | CharacterProvider | null,
  interrupt?: () => void
) {
  const store = useTutorStore()
  const isRecording = ref(false)
  const isEncoding = ref(false)
  const recordingDuration = ref(0)
  let timer: ReturnType<typeof setInterval> | undefined
  let controller: AbortController | undefined
  const character = () =>
    characterProvider && 'value' in characterProvider ? characterProvider.value : characterProvider

  async function startRecording() {
    if (isRecording.value) return
    if (!isBrowserASRSupported()) throw new Error('当前浏览器不支持语音识别，请使用文字输入。')
    interrupt?.()
    isRecording.value = true
    recordingDuration.value = 0
    timer = setInterval(() => recordingDuration.value++, 1000)
    controller = new AbortController()
    client.emit('recording.start', undefined)
    try {
      const result = await recognizeSpeech({ lang: 'en-US' })
      if (controller.signal.aborted) return
      client.emit('recording.stop', {
        durationMs: recordingDuration.value * 1000,
        cancelled: false
      })
      client.emit('message.user', { text: '[语音]', isVoice: true })
      client.emit('state.thinking', undefined)
      store.setLastUserTranscript(result.transcript)
      await sendToBackend({ type: 'user.speak', text: result.transcript, stream: true })
    } catch (error) {
      if (!controller.signal.aborted) {
        store.isThinking = false
        store.messages.push({
          id: createMessageId(),
          role: 'assistant',
          text: `⚠️ 语音识别失败: ${error instanceof Error ? error.message : '未知错误'}`,
          timestamp: Date.now()
        })
      }
    } finally {
      finish()
    }
  }

  function finish() {
    if (timer) clearInterval(timer)
    timer = undefined
    isRecording.value = false
    character()?.setMouthOpen(0)
  }

  async function stopRecording() {
    if (!isRecording.value) return
    controller?.abort()
    client.emit('recording.stop', { durationMs: recordingDuration.value * 1000, cancelled: true })
    finish()
  }

  const cancelRecording = stopRecording
  onUnmounted(() => {
    controller?.abort()
    finish()
  })

  return {
    isRecording,
    isEncoding,
    recordingDuration,
    startRecording,
    stopRecording,
    cancelRecording
  }
}
