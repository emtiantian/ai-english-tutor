import { ref, onMounted } from 'vue'
import type { TutorClient } from '../client/TutorClient.js'

/**
 * 通过 TutorClient 拉取运行时语音配置。
 *
 * - asrProvider：决定录音链路——'browser' 走浏览器 Web Speech API（本地识别），
 *   其它值（whisper / volcengine / ...）则把音频上传后端识别。useAudioRecorder 据此分流。
 * - ttsProvider：后端当前配置的 TTS 服务商（browser / xiaomi / cosyvoice / volcengine）。
 * 挂载时自动请求一次；加载失败回退到浏览器 ASR 和 TTS。
 */
export type ASRProvider = 'browser' | 'xiaomi' | 'whisper' | 'mock' | string
export type TTSProvider = 'browser' | 'xiaomi' | 'cosyvoice' | 'volcengine' | string

export function useASRConfig(client: TutorClient) {
  const asrProvider = ref<ASRProvider>('browser')
  const ttsProvider = ref<TTSProvider>('browser')
  const loaded = ref(false)

  async function loadConfig() {
    try {
      const data = await client.getRuntimeConfig()
      asrProvider.value = data.asrProvider ?? 'browser'
      ttsProvider.value = data.ttsProvider ?? 'browser'
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
