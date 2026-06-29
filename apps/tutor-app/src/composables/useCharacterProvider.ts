import { onUnmounted, ref, type Ref } from 'vue'
import type { CharacterProvider } from '@ai-english-tutor/shared'
import { createCharacterProviderSafe, type CharacterProviderType } from '../providers/factory'
import { useTutorStore } from '../stores/tutor'
import type { TutorClient } from '../client/TutorClient'
import { getLive2DModelId, setLive2DModelId } from '../lib/live2d-model-prefs'
import { pickBestStudentHint } from '../lib/hint-picker'

/** 角色被点击、且 LLM 没有给出 reply hints 时的趣味兜底文案。 */
const TAP_BODY_FALLBACKS = [
  "I'm all ears—give it a try!",
  "Need a hint? Check the lightbulb above the input!",
  "Don't be shy, say something in English!",
  "Tap the 💡 if you'd like a suggestion!",
  "I'm ready when you are!",
  "Your turn—say it in your own words!",
  "Stuck? Try the hint first, then tap me again.",
]

function getTapFallbackText(): string {
  return TAP_BODY_FALLBACKS[Math.floor(Math.random() * TAP_BODY_FALLBACKS.length)]
}

/**
 * Composable that manages CharacterProvider lifecycle.
 *
 * Reads VITE_CHARACTER_PROVIDER env var to determine which provider to use.
 * Supports: 'live2d' | 'spine' | 'rive' | 'svg'
 *
 * 当 providerType='live2d' 时,从 localStorage / VITE_LIVE2D_MODEL_ID 读模型 ID,
 * 并提供 switchLive2DModel(id) 在运行时切换。
 */
export function useCharacterProvider(canvasRef: Ref<HTMLCanvasElement | null>, client: TutorClient) {
  const store = useTutorStore()
  const providerType: CharacterProviderType =
    (import.meta.env.VITE_CHARACTER_PROVIDER as CharacterProviderType) ?? 'live2d'

  let currentProvider: CharacterProvider | null = null
  let eventUnsubscribers: (() => void)[] = []

  /** 当前生效的 Live2D 模型 ID(响应式,UI 可以绑定) */
  const currentLive2DModelId = ref<string>(getLive2DModelId())

  /** 切换中标志(避免并发切换 / UI loading 提示) */
  const isSwitching = ref(false)

  /**
   * 内部:基于 modelId 创建 provider 并装配事件。
   * 失败时 createCharacterProviderSafe 会自动降级到 SVG,这里只负责装配 wiring。
   */
  async function buildProvider(modelId: string): Promise<CharacterProvider | null> {
    if (!canvasRef.value) return null
    const provider = await createCharacterProviderSafe({
      type: providerType,
      canvas: canvasRef.value,
      live2dModelId: providerType === 'live2d' ? modelId : undefined,
    })

    // Wire tap-body interaction.
    // When LLM has provided studentReplyHints, tapping the character speaks the
    // best hint for the user ("AI answers for me"). Otherwise we fall back to a
    // small set of playful, learning-oriented easter-eggs.
    provider.onTapBody?.(() => {
      let replyText: string | undefined
      for (let i = store.messages.length - 1; i >= 0; i--) {
        const msg = store.messages[i]
        if (msg.role === 'assistant' && msg.studentReplyHints && msg.studentReplyHints.length > 0) {
          replyText = pickBestStudentHint(msg.studentReplyHints, {
            targetWords: store.currentScenario?.targetWords,
            wordsLearned: store.currentScenario?.wordsLearned,
          })
          break
        }
      }

      const text = replyText ?? getTapFallbackText()
      store.teacherProvider?.generateResponse({
        text,
        level: store.currentLevel ?? undefined,
      }).catch((err: unknown) => console.error('[CharacterProvider] Tap body failed:', err))
    })

    eventUnsubscribers = wireCharacterEvents(provider, client)
    return provider
  }

  /**
   * Initialize the character provider.
   * Call this once after canvas is ready.
   */
  async function init(): Promise<void> {
    if (!canvasRef.value) return

    try {
      const provider = await buildProvider(currentLive2DModelId.value)
      if (!provider) return

      currentProvider = provider
      store.characterProvider = provider
      console.log(`[CharacterProvider] Initialized: ${providerType}` +
        (providerType === 'live2d' ? ` (model=${currentLive2DModelId.value})` : ''))
      // DEV 调试:window.__char 实时返回当前 provider(切模型后自动跟随),
      // 方便控制台逐个测动作:__char.playMotion('wave') / __char.playMotion('_3')(原始 key 直通)
      if (import.meta.env.DEV) {
        Object.defineProperty(window, '__char', {
          get: () => store.characterProvider,
          configurable: true,
        })
      }
    } catch (err) {
      console.error(`[CharacterProvider] Failed to init ${providerType}:`, err)
    }
  }

  /**
   * 运行时切换 Live2D 模型。
   *
   * 流程:
   *   1. 标记 isSwitching=true(供 UI loading 显示)
   *   2. unwire 旧 provider 事件 + dispose 释放 WebGL/Framework
   *   3. 写 localStorage(用户下次启动会沿用这个选择)
   *   4. 用新 modelId 重建 provider
   *   5. 失败时 fallback 到 hiyori,再失败保持旧 provider
   *
   * 只对 type='live2d' 生效,其他 type 调用会 no-op。
   */
  async function switchLive2DModel(newModelId: string): Promise<void> {
    if (providerType !== 'live2d') {
      console.warn('[CharacterProvider] switchLive2DModel called but providerType is not live2d')
      return
    }
    if (newModelId === currentLive2DModelId.value && currentProvider) {
      // 同一个模型,直接返回
      return
    }
    if (isSwitching.value) {
      console.warn('[CharacterProvider] switch already in progress, ignoring')
      return
    }

    isSwitching.value = true
    const previousProvider = currentProvider
    const previousModelId = currentLive2DModelId.value
    const previousUnsubs = eventUnsubscribers

    try {
      // 1. 拆旧的事件订阅 + 释放 WebGL/Framework
      previousUnsubs.forEach((unsub) => unsub())
      eventUnsubscribers = []
      previousProvider?.dispose()
      currentProvider = null
      store.characterProvider = null

      // 2. 持久化用户选择 + 用新 ID 重建
      setLive2DModelId(newModelId)
      currentLive2DModelId.value = newModelId
      const next = await buildProvider(newModelId)

      if (!next) {
        // canvas 不可用 — 极少见,等下次 init
        return
      }

      currentProvider = next
      store.characterProvider = next
      console.log(`[CharacterProvider] Switched live2d model: ${previousModelId} → ${newModelId}`)
    } catch (err) {
      console.error(
        `[CharacterProvider] Failed to switch to ${newModelId}, falling back to hiyori:`,
        err,
      )
      // 失败兜底:尝试用 hiyori 重建。如果连 hiyori 都建不出来,记录但保持空。
      try {
        setLive2DModelId('hiyori')
        currentLive2DModelId.value = 'hiyori'
        const fallback = await buildProvider('hiyori')
        if (fallback) {
          currentProvider = fallback
          store.characterProvider = fallback
        }
      } catch (fallbackErr) {
        console.error('[CharacterProvider] Even hiyori fallback failed:', fallbackErr)
      }
    } finally {
      isSwitching.value = false
    }
  }

  onUnmounted(() => {
    eventUnsubscribers.forEach((unsub) => unsub())
    currentProvider?.dispose()
    currentProvider = null
  })

  return {
    init,
    switchLive2DModel,
    currentLive2DModelId,
    isSwitching,
  }
}

/**
 * Wire TutorClient events to CharacterProvider optional methods.
 */
function wireCharacterEvents(provider: CharacterProvider, client: TutorClient): (() => void)[] {
  const unsubs: (() => void)[] = []

  unsubs.push(
    client.on('tts.start', () => {
      provider.setSpeaking?.(true)
    }),
    client.on('tts.end', () => {
      provider.setSpeaking?.(false)
    }),
    client.on('recording.start', () => {
      provider.setListening?.(true)
    }),
    client.on('recording.stop', () => {
      provider.setListening?.(false)
    }),
    client.on('state.thinking', () => {
      provider.setThinking?.(true)
    }),
    client.on('state.idle', () => {
      provider.setThinking?.(false)
      provider.setSpeaking?.(false)
    }),
    client.on('error', () => {
      provider.onError?.()
    }),
    client.on('message.assistant', (response) => {
      provider.setListening?.(false)
      if (response.expressionId) {
        provider.setEmotion?.(response.expressionId)
      }
    }),
    client.on('message.user', () => {
      provider.setEmotion?.('neutral')
    }),
  )

  return unsubs
}
