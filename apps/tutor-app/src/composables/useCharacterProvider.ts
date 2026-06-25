import { onUnmounted, type Ref } from 'vue'
import type { CharacterProvider } from '@ai-english-tutor/shared'
import { createCharacterProviderSafe, type CharacterProviderType } from '../providers/factory'
import { useTutorStore } from '../stores/tutor'
import type { TutorClient } from '../client/TutorClient'

/**
 * Composable that manages CharacterProvider lifecycle.
 *
 * Reads VITE_CHARACTER_PROVIDER env var to determine which provider to use.
 * Supports: 'live2d' | 'spine' | 'rive' | 'svg'
 */
export function useCharacterProvider(canvasRef: Ref<HTMLCanvasElement | null>, client: TutorClient) {
  const store = useTutorStore()
  const providerType: CharacterProviderType =
    (import.meta.env.VITE_CHARACTER_PROVIDER as CharacterProviderType) ?? 'live2d'

  let currentProvider: CharacterProvider | null = null
  let eventUnsubscribers: (() => void)[] = []

  /**
   * Initialize the character provider.
   * Call this once after canvas is ready.
   */
  async function init(): Promise<void> {
    if (!canvasRef.value) return

    try {
      const provider = await createCharacterProviderSafe({
        type: providerType,
        canvas: canvasRef.value,
      })

      currentProvider = provider

      // Wire tap-body interaction
      provider.onTapBody?.(() => {
        const tapMessages = [
          'Hey, you tapped me!',
          'That tickles!',
          'Hi there! Nice to meet you!',
          'Ooh, what do you want to learn today?',
          'Hello! Ready for an English lesson?',
        ]
        const text = tapMessages[Math.floor(Math.random() * tapMessages.length)]
        store.teacherProvider?.generateResponse({
          text,
          level: store.currentLevel ?? undefined,
        }).catch((err: unknown) => console.error('[CharacterProvider] Tap body failed:', err))
      })

      // Wire Live2D enhanced behavior events
      eventUnsubscribers = wireCharacterEvents(provider, client)

      store.characterProvider = provider
      console.log(`[CharacterProvider] Initialized: ${providerType}`)
    } catch (err) {
      console.error(`[CharacterProvider] Failed to init ${providerType}:`, err)
    }
  }

  onUnmounted(() => {
    eventUnsubscribers.forEach((unsub) => unsub())
    currentProvider?.dispose()
    currentProvider = null
  })

  return { init }
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
