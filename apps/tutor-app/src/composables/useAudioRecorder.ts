import { ref, onUnmounted } from 'vue'
import type { TutorClient } from '../client/TutorClient'
import { useTutorStore } from '../stores/tutor'
import { AudioRecorder } from '../audio/recorder'
import { useAudioEncoder } from './useAudioEncoder'
import { isBrowserASRSupported, recognizeSpeech } from '../audio/browser-asr'
import type { ASRProvider } from './useASRConfig'
import type { ChatRequestBody, ChatResponse } from '../client/types'

/**
 * 管理录音生命周期的 composable，
 * 包括计时器、UI 状态以及向后端提交音频。
 *
 * 两条 ASR 路径共享相同的生命周期/UI 外壳：
 *   - 'browser' → 浏览器内 Web Speech API，仅发送转写文本
 *   - 其他（xiaomi/whisper/mock）→ 录制音频，将 base64 发给后端，
 *     后端完成 ASR + LLM + TTS 并通过 SSE 流式返回。
 *
 * 两条路径都使用 `stream: true` 调用 /api/chat（user.speak）：HTTP 仅返回 202；
 * 真正的教师回复通过 SSE 到达。这样在客户端保持单一投递路径，避免重复处理。
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
  /** 由于评估流程已移除，音频请求类型固定为 user.speak。 */
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

    // ── 浏览器 ASR 路径 ──
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

    // ── 云端 ASR 路径（基于音频）──
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
   * 仅浏览器 ASR：发送用户语音气泡，并通过与云端 ASR 路径相同的流式通道
   * 将转写文本以纯文本形式推给后端。
   * 后端会跳过 ASR 步骤，直接进入 LLM + TTS，并通过 SSE 流式返回回复。
   */
  async function sendBrowserTranscript(transcript: string) {
    client.emit('recording.stop', { durationMs: recordingDuration.value * 1000, cancelled: false })
    client.emit('message.user', { text: '[语音]', isVoice: true })
    client.emit('state.thinking', undefined)

    // 将识别到的转写文本附加到刚发送的用户气泡上，
    // 这样无论 LLM 多慢，用户都能看到浏览器听到了什么。
    store.setLastUserTranscript(transcript)

    await sendToBackend({
      type: requestType,
      text: transcript,
      stream: true,
    })
  }

  async function stopRecording() {
    if (!isRecording.value) return

    // ── 浏览器 ASR 路径：中止识别器，生命周期清理在 startRecording 的 finally 中执行 ──
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

      // 在主线程上将录制的 Blob 解码为单声道 PCM（Web Audio 只能在主线程运行），
      // 然后将耗 CPU 的重采样和 MP3 编码交给 Web Worker。
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

        // 语音路径与文本路径使用相同的流式投递：HTTP 立即确认，
        // 完整回复（文本、音频、场景）通过 SSE 到达。
        // 这样可以避免同一份回复被 HTTP 和 SSE 同时处理。
        await sendToBackend({ ...payload, stream: true })
      } finally {
        decodeAbortController = null
      }
    } catch (err) {
      console.error('[useAudioRecorder] Failed to stop recording:', err)
      isRecording.value = false
      store.isThinking = false
      // 向用户显示错误
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

    // 浏览器 ASR 路径：中止识别器
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
 * 在主线程上将音频 Blob 解码为单声道 PCM 采样。
 * 异步 Web Audio API 在浏览器的音频线程中运行，
 * 因此不会像 MP3 编码循环那样严重阻塞 JavaScript 事件循环。
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
      // 解码时关闭上下文应会使 decodeAudioData 拒绝，
      // 从而防止 iOS Safari 上 AudioContext 泄漏。
      audioContext.close().catch(() => {})
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    const arrayBuffer = await blob.arrayBuffer()
    const decoded = await audioContext.decodeAudioData(arrayBuffer)
    const channelData = decoded.getChannelData(0)
    // 复制到新的 Float32Array，以便将底层 buffer 转移给 worker。
    return { samples: new Float32Array(channelData), sampleRate: decoded.sampleRate }
  } finally {
    if (onAbort) {
      signal?.removeEventListener('abort', onAbort)
    }
    await audioContext.close()
  }
}
