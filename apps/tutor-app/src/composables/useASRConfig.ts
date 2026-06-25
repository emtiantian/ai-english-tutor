import { ref, onMounted } from 'vue'

export type ASRProvider = 'browser' | 'xiaomi' | 'whisper' | 'mock' | string

export function useASRConfig() {
  const asrProvider = ref<ASRProvider>('xiaomi')
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
    } catch (err) {
      console.error('[useASRConfig] Failed to load config, defaulting to server ASR:', err)
      asrProvider.value = 'xiaomi'
    } finally {
      loaded.value = true
    }
  }

  onMounted(loadConfig)

  return {
    asrProvider,
    loaded,
    loadConfig,
  }
}
