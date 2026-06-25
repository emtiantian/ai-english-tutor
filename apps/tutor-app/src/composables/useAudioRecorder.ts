import { ref, onUnmounted } from 'vue'
import type { TutorClient } from '../client/TutorClient'
import { useTutorStore } from '../stores/tutor'
import { AudioRecorder } from '../audio/recorder'
import { useAudioEncoder } from './useAudioEncoder'
import { isBrowserASRSupported, recognizeSpeech } from '../audio/browser-asr'
import type { ASRProvider } from './useASRConfig'
import type { ChatRequestBody, ChatResponse } from '../client/types'

/**
 * Composable that manages voice recording lifecycle,
 * including timer, UI state, and audio-to-backend submission.
 *
 * Two ASR paths share the same lifecycle/UI shell:
 *   - 'browser'   → Web Speech API in the browser, transcript-only request
 *   - everything else (xiaomi/whisper/mock) → record audio, send base64
 *     to backend, backend does ASR + LLM + TTS and streams via SSE.
 *
 * Both paths use `stream: true` to /api/chat (user.speak): HTTP only acks 202;
 * the actual teacher response arrives over SSE. This keeps a single delivery
 * path on the client and avoids duplicate processing.
 */
export function useAudioRecorder(
  client: TutorClient,
  sendToBackend: (payload: Partial<ChatRequestBody> & { type: ChatRequestBody['type'] }) => Promise<ChatResponse>,
  asrProvider: () => ASRProvider = () => 'xiaomi',
) {
  const store = useTutorStore()
  const { isEncoding, encode, terminate } = useAudioEncoder()

  const isRecording = ref(false)
  const recordingDuration = ref(0)
  /** Audio request type is fixed to user.speak since assessment flow was removed. */
  const requestType: ChatRequestBody['type'] = 'user.speak'
  let recordingTimer: ReturnType<typeof setInterval> | null = null
  let recorder: AudioRecorder | null = null
  let decodeAbortController: AbortController | null = null
  let browserASRAbortController: AbortController | null = null

  function startTimer() {
    recordingDuration.value = 0
    recordingTimer = setInterval(() => {
      recordingDuration.value++
    }, 1000)
  }

  function stopTimer() {
    if (recordingTimer) {
      clearInterval(recordingTimer)
      recordingTimer = null
    }
  }

  async function startRecording() {
    if (isRecording.value) return

    // ── Browser ASR path ──
    if (asrProvider() === 'browser') {
      if (!isBrowserASRSupported()) {
        throw new Error('当前浏览器不支持语音识别，请改用 Chrome / Edge / Safari，或在后端切到云端 ASR。')
      }
      isRecording.value = true
      startTimer()
      client.emit('recording.start', undefined)

      browserASRAbortController = new AbortController()
      try {
        const result = await recognizeSpeech({ lang: 'en-US' })
        if (browserASRAbortController?.signal.aborted) return
        await sendBrowserTranscript(result.transcript)
      } catch (err) {
        if (browserASRAbortController?.signal.aborted) return
        console.error('[useAudioRecorder] Browser ASR failed:', err)
        store.isThinking = false
        store.messages.push({
          id: `msg-${Date.now()}`,
          role: 'assistant',
          text: `⚠️ 语音识别失败: ${err instanceof Error ? err.message : '未知错误'}`,
          timestamp: Date.now(),
        })
      } finally {
        stopTimer()
        isRecording.value = false
        browserASRAbortController = null
        store.characterProvider?.setMouthOpen(0)
      }
      return
    }

    // ── Cloud ASR path (audio-based) ──
    try {
      recorder = new AudioRecorder({
        onVolume: (volume) => store.characterProvider?.setMouthOpen(volume),
      })

      await recorder.start()
      isRecording.value = true
      startTimer()

      client.emit('recording.start', undefined)
    } catch (err) {
      console.error('[useAudioRecorder] Failed to start recording:', err)
      const isSecure = window.isSecureContext
      const msg = !isSecure
        ? '录音需要 HTTPS 环境。请通过 https:// 访问本页（iOS Safari 必须使用 HTTPS 才能访问麦克风）。'
        : `无法启动录音: ${err instanceof Error ? err.message : '未知错误'}`
      throw new Error(msg)
    }
  }

  /**
   * Browser-ASR-only: emit the user voice bubble, push transcript to backend
   * as plain text via the same streaming path used by the cloud-ASR path.
   * Backend will skip its ASR step and go straight to LLM + TTS, streaming
   * the response back over SSE.
   */
  async function sendBrowserTranscript(transcript: string) {
    client.emit('recording.stop', { durationMs: recordingDuration.value * 1000, cancelled: false })
    client.emit('message.user', { text: '[语音]', isVoice: true })
    client.emit('state.thinking', undefined)

    // Attach the recognised transcript to the just-emitted user bubble so the
    // user can see what the browser heard, regardless of how slow the LLM is.
    store.setLastUserTranscript(transcript)

    await sendToBackend({
      type: requestType,
      text: transcript,
      stream: true,
    })
  }

  async function stopRecording() {
    if (!isRecording.value) return

    // ── Browser ASR path: abort recogniser, lifecycle cleanup runs in startRecording's finally ──
    if (asrProvider() === 'browser') {
      browserASRAbortController?.abort()
      browserASRAbortController = null
      stopTimer()
      isRecording.value = false
      client.emit('recording.stop', { durationMs: recordingDuration.value * 1000, cancelled: true })
      store.characterProvider?.setMouthOpen(0)
      return
    }

    if (!recorder) return
    stopTimer()

    try {
      const { blob, mimeType } = await recorder.stop()
      isRecording.value = false
      client.emit('recording.stop', { durationMs: recordingDuration.value * 1000, cancelled: false })

      // Decode recorded Blob into mono PCM on the main thread (Web Audio is main-thread only),
      // then offload the CPU-heavy resampling + MP3 encoding to the Web Worker.
      decodeAbortController = new AbortController()
      try {
        const { samples, sampleRate } = await decodeToMonoPcm(blob, decodeAbortController.signal)
        decodeAbortController = null

        const mp3Blob = await encode(samples, sampleRate)

        const base64 = await blobToBase64(mp3Blob)
        const audioFormat = 'mp3'

        client.emit('message.user', { text: '[语音]', isVoice: true })
        client.emit('state.thinking', undefined)

        const payload: Partial<ChatRequestBody> & { type: ChatRequestBody['type'] } = {
          type: requestType,
          audioBase64: base64,
          audioFormat,
        }

        // Voice path uses the same streaming delivery as text: HTTP acknowledges
        // immediately and the full response (text, audio, scenario) arrives via SSE.
        // This avoids double-processing the same response from both HTTP and SSE.
        await sendToBackend({ ...payload, stream: true })
      } finally {
        decodeAbortController = null
      }
    } catch (err) {
      console.error('[useAudioRecorder] Failed to stop recording:', err)
      isRecording.value = false
      store.isThinking = false
      // Show error to user
      store.messages.push({
        id: `msg-${Date.now()}`,
        role: 'assistant',
        text: `⚠️ 语音处理失败: ${err instanceof Error ? err.message : '未知错误'}`,
        timestamp: Date.now(),
      })
    } finally {
      store.characterProvider?.setMouthOpen(0)
    }
  }

  async function cancelRecording() {
    if (!isRecording.value) return

    stopTimer()

    // Browser ASR path: abort recogniser
    if (asrProvider() === 'browser') {
      browserASRAbortController?.abort()
      browserASRAbortController = null
      isRecording.value = false
      recordingDuration.value = 0
      client.emit('recording.stop', { durationMs: recordingDuration.value * 1000, cancelled: true })
      store.characterProvider?.setMouthOpen(0)
      return
    }

    if (!recorder) return

    try {
      recorder.cancel()
      client.emit('recording.stop', { durationMs: recordingDuration.value * 1000, cancelled: true })
    } catch (err) {
      console.error('[useAudioRecorder] Failed to cancel recording:', err)
    } finally {
      isRecording.value = false
      recordingDuration.value = 0
      recorder = null
      store.characterProvider?.setMouthOpen(0)
    }
  }

  onUnmounted(() => {
    stopTimer()
    decodeAbortController?.abort()
    decodeAbortController = null
    browserASRAbortController?.abort()
    browserASRAbortController = null
    terminate()
  })

  return { isRecording, isEncoding, recordingDuration, requestType, startRecording, stopRecording, cancelRecording }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Decode an audio Blob into mono PCM samples on the main thread.
 * The async Web Audio API runs this on the browser's audio thread,
 * so it does not block JavaScript event loop as badly as the MP3 encoder loop.
 */
async function decodeToMonoPcm(
  blob: Blob,
  signal?: AbortSignal,
): Promise<{ samples: Float32Array; sampleRate: number }> {
  const audioContext = new AudioContext()
  let onAbort: (() => void) | undefined
  try {
    if (signal?.aborted) {
      throw new Error('AbortError')
    }

    onAbort = () => {
      // Closing the context while decoding should cause decodeAudioData to reject,
      // preventing AudioContext leaks on iOS Safari.
      audioContext.close().catch(() => {})
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    const arrayBuffer = await blob.arrayBuffer()
    const decoded = await audioContext.decodeAudioData(arrayBuffer)
    const channelData = decoded.getChannelData(0)
    // Copy into a new Float32Array so we can transfer the underlying buffer to the worker.
    return { samples: new Float32Array(channelData), sampleRate: decoded.sampleRate }
  } finally {
    if (onAbort) {
      signal?.removeEventListener('abort', onAbort)
    }
    await audioContext.close()
  }
}
