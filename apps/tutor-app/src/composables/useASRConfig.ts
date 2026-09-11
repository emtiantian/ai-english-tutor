import { ref, onMounted } from 'vue'
import type { TutorClient } from '../client/TutorClient.js'

/**
 * 通过 TutorClient 拉取运行时语音配置。
 *
 * - asrProvider：第一版固定使用浏览器 Web Speech API。
 * - ttsProvider：后端当前配置的小米 TTS 或浏览器降级。
 * 挂载时自动请求一次；加载失败回退到浏览器 ASR 和 TTS。
 */
export type ASRProvider = 'browser'
export type TTSProvider = 'browser' | 'xiaomi'

export function useASRConfig(client: TutorClient) {
  const asrProvider = ref<ASRProvider>('browser')
  const ttsProvider = ref<TTSProvider>('browser')
  const loaded = ref(false)

  async function loadConfig() {
    try {
      const data = await client.getRuntimeConfig()
      asrProvider.value = 'browser'
      ttsProvider.value = data.ttsProvider === 'xiaomi' ? 'xiaomi' : 'browser'
    } catch (err) {
      console.error('[useASRConfig] Failed to load config, defaulting to browser ASR:', err)
      asrProvider.value = 'browser'
      ttsProvider.value = 'browser'
    } finally {
      loaded.value = true
    }
  }

  onMounted(loadConfig)

  return {
    asrProvider,
    ttsProvider,
    loaded,
    loadConfig
  }
}
