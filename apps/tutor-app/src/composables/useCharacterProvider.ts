import { onUnmounted, type Ref } from 'vue'
import type { CharacterProvider } from '@ai-english-tutor/shared'
import { createCharacterProvider } from '../providers/factory.js'
import type { TutorClient } from '../client/TutorClient.js'

export function useCharacterProvider(
  canvasRef: Ref<HTMLCanvasElement | null>,
  client: TutorClient,
  providerRef: Ref<CharacterProvider | null>
) {
  let eventUnsubscribers: (() => void)[] = []
  let initializationPromise: Promise<void> | null = null
  let disposed = false

  function init(): Promise<void> {
    if (providerRef.value) return Promise.resolve()
    if (initializationPromise) return initializationPromise

    initializationPromise = initialize().catch(error => {
      initializationPromise = null
      throw error
    })
    return initializationPromise
  }

  async function initialize(): Promise<void> {
    const canvas = canvasRef.value
    if (!canvas) return

    const provider = await createCharacterProvider({
      type: 'live2d',
      canvas
    })

    if (disposed) {
      provider.dispose()
      return
    }

    providerRef.value = provider
    eventUnsubscribers = wireCharacterEvents(provider, client)
  }

  onUnmounted(() => {
    disposed = true
    eventUnsubscribers.forEach(unsubscribe => unsubscribe())
    providerRef.value?.dispose()
    providerRef.value = null
  })

  return { init }
}

function wireCharacterEvents(provider: CharacterProvider, client: TutorClient): (() => void)[] {
  return [
    client.on('recording.start', () => provider.setListening?.(true)),
    client.on('recording.stop', () => provider.setListening?.(false)),
    client.on('state.thinking', () => provider.setThinking?.(true)),
    client.on('error', () => provider.onError?.()),
    client.on('message.assistant', response => {
      provider.setListening?.(false)
      provider.setThinking?.(false)
      if (response.expressionId) provider.setEmotion?.(response.expressionId)
    }),
    client.on('message.user', () => provider.setEmotion?.('neutral'))
  ]
}
