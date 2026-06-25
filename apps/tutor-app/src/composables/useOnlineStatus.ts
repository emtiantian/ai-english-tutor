import { ref, onMounted, onUnmounted } from 'vue'

/**
 * 在线状态检测 composable
 *
 * 监听浏览器 online/offline 事件，提供响应式的在线状态。
 */
export function useOnlineStatus() {
  const isOnline = ref(navigator.onLine)

  function update() {
    isOnline.value = navigator.onLine
  }

  onMounted(() => {
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
  })

  onUnmounted(() => {
    window.removeEventListener('online', update)
    window.removeEventListener('offline', update)
  })

  return { isOnline }
}
