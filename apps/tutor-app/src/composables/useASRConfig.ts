import { ref, onMounted } from 'vue'

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
