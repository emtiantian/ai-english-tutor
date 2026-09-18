const CORE_SCRIPT_ID = 'live2d-cubism-core'
const CORE_SCRIPT_URL = '/lib/live2dcubismcore.min.js'
const CORE_LOAD_TIMEOUT_MS = 60_000

let coreLoadPromise: Promise<void> | null = null

function isCoreReady(): boolean {
  return typeof Live2DCubismCore !== 'undefined'
}

/**
 * 首次需要角色时再加载 Cubism Core。共享同一个 Promise，避免页面切换时重复请求脚本。
 */
export function loadLive2DCore(): Promise<void> {
  if (isCoreReady()) return Promise.resolve()
  if (coreLoadPromise) return coreLoadPromise

  const pendingLoad = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(CORE_SCRIPT_ID)
    const script = existingScript instanceof HTMLScriptElement ? existingScript : createCoreScript()
    const timeoutId = window.setTimeout(() => {
      cleanup()
      reject(new Error('Live2D Core load timeout'))
    }, CORE_LOAD_TIMEOUT_MS)

    const cleanup = () => {
      window.clearTimeout(timeoutId)
      script.removeEventListener('load', handleLoad)
      script.removeEventListener('error', handleError)
    }

    const handleLoad = () => {
      cleanup()
      if (isCoreReady()) {
        resolve()
      } else {
        reject(new Error('Live2D Core loaded without exposing its API'))
      }
    }

    const handleError = () => {
      cleanup()
      reject(new Error('Failed to load Live2D Core'))
    }

    script.addEventListener('load', handleLoad, { once: true })
    script.addEventListener('error', handleError, { once: true })

    if (!existingScript) document.head.append(script)
  })

  coreLoadPromise = pendingLoad.catch(error => {
    coreLoadPromise = null
    document.getElementById(CORE_SCRIPT_ID)?.remove()
    throw error
  })
  return coreLoadPromise
}

function createCoreScript(): HTMLScriptElement {
  const script = document.createElement('script')
  script.id = CORE_SCRIPT_ID
  script.src = CORE_SCRIPT_URL
  script.async = true
  return script
}
