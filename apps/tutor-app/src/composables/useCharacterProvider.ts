import { onUnmounted, ref, computed, type Ref } from 'vue'
import type { CharacterProvider } from '@ai-english-tutor/shared'
import { createCharacterProviderSafe, type CharacterProviderType } from '../providers/factory'
import { RemoteTeacherProvider } from '../providers/remote-teacher'
import { useTutorStore } from '../stores/tutor'
import type { TutorClient } from '../client/TutorClient'
import { getLive2DModelId, setLive2DModelId } from '../lib/live2d-model-prefs'
import { useCurrentHint } from './useCurrentHint'

/** 角色被点击、且 LLM 没有给出 reply hints 时的趣味兜底文案。 */
const TAP_BODY_FALLBACKS = [
  "I'm all ears—give it a try!",
  'Need a hint? Check the lightbulb above the input!',
  "Don't be shy, say something in English!",
  "Tap the 💡 if you'd like a suggestion!",
  "I'm ready when you are!",
  'Your turn—say it in your own words!',
  'Stuck? Try the hint first, then tap me again.'
]

function getTapFallbackText(): string {
  return TAP_BODY_FALLBACKS[Math.floor(Math.random() * TAP_BODY_FALLBACKS.length)]
}

/**
 * 管理 CharacterProvider 生命周期的 composable。
 *
 * 读取 VITE_CHARACTER_PROVIDER 环境变量来决定使用哪个 provider。
 * 支持：'live2d' | 'spine' | 'rive' | 'svg'
 *
 * 当 providerType='live2d' 时，从 localStorage / VITE_LIVE2D_MODEL_ID 读取模型 ID，
 * 并提供 switchLive2DModel(id) 在运行时切换。
 */
export function useCharacterProvider(
  canvasRef: Ref<HTMLCanvasElement | null>,
  client: TutorClient,
  /** 外部传入的响应式引用，init/切换模型时写入新实例。
   *  Provider 不再放进 Pinia store，由 App.vue 前置声明并分发给各 composable。 */
  providerRef: Ref<CharacterProvider | null>
) {
  const store = useTutorStore()
  const providerType: CharacterProviderType =
    (import.meta.env.VITE_CHARACTER_PROVIDER as CharacterProviderType) ?? 'live2d'

  let currentProvider: CharacterProvider | null = null
  let eventUnsubscribers: (() => void)[] = []

  // 点击身体时代替用户发言的远程教师 Provider
  const teacherProvider = new RemoteTeacherProvider(client)

  // 当前最佳提示（用于点击角色身体时代替用户回答）
  const { suggestedPhrase: currentHint } = useCurrentHint({
    messages: computed(() => store.messages),
    targetWords: computed(() => store.currentScenario?.targetWords),
    wordsLearned: computed(() => store.currentScenario?.wordsLearned)
  })

  /** 当前生效的 Live2D 模型 ID(响应式,UI 可以绑定) */
  const currentLive2DModelId = ref<string>(getLive2DModelId())

  /** 切换中标志(避免并发切换 / UI loading 提示) */
  const isSwitching = ref(false)

  /**
   * 内部：基于 modelId 创建 provider 并装配事件。
   * 失败时 createCharacterProviderSafe 会自动降级到 SVG，这里只负责事件装配。
   */
  async function buildProvider(modelId: string): Promise<CharacterProvider | null> {
    if (!canvasRef.value) return null
    const provider = await createCharacterProviderSafe({
      type: providerType,
      canvas: canvasRef.value,
      live2dModelId: providerType === 'live2d' ? modelId : undefined
    })

    // 连接点击身体交互。
    // 当 LLM 提供了 studentReplyHints 时，点击角色会为用户说出最佳提示（“帮我回答”）。
    // 否则回退到一小套有趣、以学习为导向的彩蛋文案。
    provider.onTapBody?.(() => {
      const text = currentHint.value ?? getTapFallbackText()
      teacherProvider
        .generateResponse({
          text,
          level: store.currentLevel ?? undefined
        })
        .catch((err: unknown) => console.error('[CharacterProvider] Tap body failed:', err))
    })

    eventUnsubscribers = wireCharacterEvents(provider, client)
    return provider
  }

  /**
   * 初始化角色 provider。
   * 在 canvas 准备就绪后调用一次。
   */
  async function init(): Promise<void> {
    if (!canvasRef.value) return

    try {
      const instance = await buildProvider(currentLive2DModelId.value)
      if (!instance) return

      currentProvider = instance
      providerRef.value = instance
      console.log(
        `[CharacterProvider] Initialized: ${providerType}` +
          (providerType === 'live2d' ? ` (model=${currentLive2DModelId.value})` : '')
      )
      // DEV 调试:window.__char 实时返回当前 provider(切模型后自动跟随),
      // 方便控制台逐个测动作:__char.playMotion('wave') / __char.playMotion('_3')(原始 key 直通)
      if (import.meta.env.DEV) {
        Object.defineProperty(window, '__char', {
          get: () => providerRef.value,
          configurable: true
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
      previousUnsubs.forEach(unsub => unsub())
      eventUnsubscribers = []
      previousProvider?.dispose()
      currentProvider = null
      providerRef.value = null

      // 2. 持久化用户选择 + 用新 ID 重建
      setLive2DModelId(newModelId)
      currentLive2DModelId.value = newModelId
      const next = await buildProvider(newModelId)

      if (!next) {
        // canvas 不可用 — 极少见,等下次 init
        return
      }

      currentProvider = next
      providerRef.value = next
      console.log(`[CharacterProvider] Switched live2d model: ${previousModelId} → ${newModelId}`)
    } catch (err) {
      console.error(
        `[CharacterProvider] Failed to switch to ${newModelId}, falling back to hiyori:`,
        err
      )
      // 失败兜底:尝试用 hiyori 重建。如果连 hiyori 都建不出来,记录但保持空。
      try {
        setLive2DModelId('hiyori')
        currentLive2DModelId.value = 'hiyori'
        const fallback = await buildProvider('hiyori')
        if (fallback) {
          currentProvider = fallback
          providerRef.value = fallback
        }
      } catch (fallbackErr) {
        console.error('[CharacterProvider] Even hiyori fallback failed:', fallbackErr)
      }
    } finally {
      isSwitching.value = false
    }
  }

  onUnmounted(() => {
    eventUnsubscribers.forEach(unsub => unsub())
    currentProvider?.dispose()
    currentProvider = null
  })

  return {
    init,
    switchLive2DModel,
    currentLive2DModelId,
    isSwitching
  }
}

/**
 * 将 TutorClient 事件连接到 CharacterProvider 的可选方法。
 */
function wireCharacterEvents(provider: CharacterProvider, client: TutorClient): (() => void)[] {
  const unsubs: (() => void)[] = []

  unsubs.push(
    client.on('recording.start', () => {
      provider.setListening?.(true)
    }),
    client.on('recording.stop', () => {
      provider.setListening?.(false)
    }),
    client.on('state.thinking', () => {
      provider.setThinking?.(true)
    }),
    client.on('error', () => {
      provider.onError?.()
    }),
    client.on('message.assistant', response => {
      provider.setListening?.(false)
      provider.setThinking?.(false)
      if (response.expressionId) {
        provider.setEmotion?.(response.expressionId)
      }
    }),
    client.on('message.user', () => {
      provider.setEmotion?.('neutral')
    })
  )

  return unsubs
}
