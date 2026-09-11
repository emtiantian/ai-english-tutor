import { onUnmounted, type Ref } from 'vue'
import type { CharacterProvider } from '@ai-english-tutor/shared'
import { createCharacterProviderSafe } from '../providers/factory.js'
import type { TutorClient } from '../client/TutorClient.js'

export function useCharacterProvider(
  canvasRef: Ref<HTMLCanvasElement | null>,
  client: TutorClient,
  providerRef: Ref<CharacterProvider | null>
) {
  let eventUnsubscribers: (() => void)[] = []

  async function init(): Promise<void> {
    if (!canvasRef.value) return

    const provider = await createCharacterProviderSafe({
      type: 'live2d',
      canvas: canvasRef.value
    })
    providerRef.value = provider
    eventUnsubscribers = wireCharacterEvents(provider, client)
  }

  onUnmounted(() => {
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
