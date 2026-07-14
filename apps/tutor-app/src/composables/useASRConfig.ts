import { ref, onMounted } from 'vue'

/**
 * 从后端 /api/config 拉取运行时配置，决定语音识别（ASR）与语音风格的可选项。
 *
 * - asrProvider：决定录音链路——'browser' 走浏览器 Web Speech API（本地识别），
 *   其它值（whisper / volcengine / ...）则把音频上传后端识别。useAudioRecorder 据此分流。
 * - voiceStyleSelectable：火山 TTS 用固定音色时为 false，此时「语音风格」下拉
 *   仅作用于 LLM 人格（见后端 /api/config 的 voiceStyleSelectable 字段）。
 *
 * 挂载时自动请求一次；加载失败回退到服务端 ASR 默认值。
 */
export type ASRProvider = 'browser' | 'xiaomi' | 'whisper' | 'mock' | string

export function useASRConfig() {
  const asrProvider = ref<ASRProvider>('xiaomi')
  /** 风格下拉是否也作用于音色。火山 TTS 用固定 voice_type 时为 false(下拉仍在，只改 LLM 人格)。 */
  const voiceStyleSelectable = ref(true)
  const loaded = ref(false)

  async function loadConfig() {
    try {
      const baseUrl = import.meta.env.VITE_BACKEND_URL || ''
      const response = await fetch(`${baseUrl}/api/config`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = await response.json()
      asrProvider.value = data.asrProvider ?? 'xiaomi'
      // 后端未返回该字段时默认可选，保持向后兼容
      voiceStyleSelectable.value = data.voiceStyleSelectable ?? true
    } catch (err) {
      console.error('[useASRConfig] Failed to load config, defaulting to server ASR:', err)
      asrProvider.value = 'xiaomi'
      voiceStyleSelectable.value = true
    } finally {
      loaded.value = true
    }
  }

  onMounted(loadConfig)

  return {
    asrProvider,
    voiceStyleSelectable,
    loaded,
    loadConfig,
  }
}
