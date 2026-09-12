import { onUnmounted, ref, type Ref } from 'vue'
import type { CharacterProvider } from '@ai-english-tutor/shared'
import type { TutorClient } from '../client/TutorClient.js'
import type { ChatRequestBody, ChatResponse } from '../client/types.js'
import { isBrowserASRSupported, recognizeSpeech } from '../audio/browser-asr.js'
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
  let stopController: AbortController | undefined
  const character = () =>
    characterProvider && 'value' in characterProvider ? characterProvider.value : characterProvider

  async function startRecording() {
    if (isRecording.value || isEncoding.value) return
    interrupt?.()
    isRecording.value = true
    recordingDuration.value = 0
    timer = setInterval(() => recordingDuration.value++, 1000)
    controller = new AbortController()
    const currentController = controller
    stopController = new AbortController()
    client.emit('recording.start', undefined)
    try {
      if (!isBrowserASRSupported()) throw new Error('当前浏览器不支持语音识别，请使用文字输入。')
      const result = await recognizeSpeech({
        lang: 'en-US',
        signal: currentController.signal,
        stopSignal: stopController.signal
      })
      if (currentController.signal.aborted) return
      finish()
      isEncoding.value = true
      client.emit('recording.stop', {
        durationMs: recordingDuration.value * 1000,
        cancelled: false
      })
      client.emit('message.user', { text: result.transcript, isVoice: true })
      client.emit('state.thinking', undefined)
      store.setLastUserTranscript(result.transcript)
      await sendToBackend({ type: 'user.speak', text: result.transcript, stream: true })
    } catch (error) {
      if (!currentController.signal.aborted) {
        store.isThinking = false
        console.warn('[ASR] voice input failed', error)
      }
    } finally {
      finish()
      isEncoding.value = false
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
    isEncoding.value = true
    stopController?.abort()
    finish()
  }

  const cancelRecording = () => {
    controller?.abort()
    client.emit('recording.stop', { durationMs: recordingDuration.value * 1000, cancelled: true })
    finish()
  }
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
