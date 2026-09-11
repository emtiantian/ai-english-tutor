<template>
  <div class="relative flex h-100dvh items-center justify-center overflow-hidden bg-black">
    <OfflineBanner />
    <canvas
      ref="characterCanvas"
      class="absolute inset-0 z-1 h-full w-full opacity-0 transition-opacity-800ms md:(bottom-0 top-auto h-55%)"
      :class="{ 'opacity-100': showCharacterCanvas }"
    />

    <ScenarioPicker
      v-if="store.phase === 'scenario-select'"
      :scenarios="availableScenarios"
      @select="handleScenarioSelect"
    />

    <ChatMessageList
      v-if="store.phase === 'teaching'"
      :messages="store.messages"
      :is-playing="store.isPlaying"
      @replay="handleReplay"
      @speak-word="handleSpeakWord"
      @word-detail="handleWordDetail"
    />

    <WordDetailModal
      v-if="activeWord"
      :word="activeWord"
      :explanation="wordExplanation"
      :loading="wordLoading"
      :error="wordError"
      @close="closeWordDetail"
      @speak="handleSpeakWord(activeWord)"
    />

    <ChatInputBar
      v-if="store.phase === 'teaching'"
      :is-recording="isRecording"
      :is-encoding="isEncoding"
      :recording-duration="recordingDuration"
      :scenario="store.currentScenario"
      :suggested-phrase="suggestedPhrase"
      @send-text="sendText"
      @record-start="startRecording"
      @record-stop="stopRecording"
      @switch-scenario="handleSwitchScenario"
    />

    <div
      v-if="store.isThinking && store.phase === 'teaching'"
      class="absolute bottom-100px left-1/2 z-15 flex -translate-x-1/2 items-center gap-6px px-16px py-8px text-13px text-white/80 glass-sm"
    >
      <span class="dot-blink" />
      <span class="dot-blink animate-delay-200" />
      <span class="dot-blink animate-delay-400" />
      正在思考...
    </div>

    <div
      v-if="!store.isConnected && store.phase === 'teaching'"
      class="absolute right-10px top-10px z-20 rounded-12px bg-danger-80 px-12px py-6px text-12px font-500 text-white"
    >
      连接断开
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, provide, ref, shallowRef } from 'vue'
import type { CharacterProvider } from '@ai-english-tutor/shared'
import { useTutorStore } from './stores/tutor.js'
import { useTutorClient } from './composables/useTutorClient.js'
import { useCharacterProvider } from './composables/useCharacterProvider.js'
import { useAudioPlayback } from './composables/useAudioPlayback.js'
import { useAudioRecorder } from './composables/useAudioRecorder.js'
import { useASRConfig } from './composables/useASRConfig.js'
import { useCurrentHint } from './composables/useCurrentHint.js'
import ChatMessageList from './components/ChatMessageList.vue'
import WordDetailModal from './components/WordDetailModal.vue'
import ChatInputBar from './components/ChatInputBar.vue'
import ScenarioPicker from './components/ScenarioPicker.vue'
import OfflineBanner from './components/OfflineBanner.vue'
import type { ChatRequestBody, ScenarioSummary, WordExplanation } from './client/types.js'
import { createMessageId } from './lib/message-utils.js'
import { blobToBase64 } from './audio/utils.js'

const store = useTutorStore()
const showCharacterCanvas = ref(false)
const characterCanvas = ref<HTMLCanvasElement | null>(null)
const availableScenarios = ref<ScenarioSummary[]>([])
const characterProvider = shallowRef<CharacterProvider | null>(null)

const { client } = useTutorClient({ characterProvider })
const {
  audioPlayer,
  replayAudio,
  unlockAudio,
  abort: abortPlayback
} = useAudioPlayback(client, characterProvider)
const { asrProvider } = useASRConfig(client)
const { isRecording, isEncoding, recordingDuration, startRecording, stopRecording } =
  useAudioRecorder(
    client,
    sendToBackend,
    () => asrProvider.value,
    characterProvider,
    interruptTeacher
  )
const { init: initCharacter } = useCharacterProvider(characterCanvas, client, characterProvider)
const { suggestedPhrase } = useCurrentHint({
  messages: computed(() => store.messages),
  targetWords: computed(() => store.currentScenario?.targetWords),
  wordsLearned: computed(() => store.currentScenario?.wordsLearned)
})

provide('characterProvider', characterProvider)

async function sendToBackend(
  payload: Partial<ChatRequestBody> & { type: ChatRequestBody['type'] }
) {
  store.requestEpoch++
  const requestId = createMessageId().replace('msg-', 'req-')
  return client.sendMessage(
    {
      level: 1,
      sessionId: store.connectionId,
      requestId,
      ...payload
    },
    payload.audioBase64 ? 120000 : undefined
  )
}

function interruptTeacher() {
  store.markStreamingInterrupted()
  abortPlayback()
  client.interrupt()
}

onMounted(async () => {
  await initCharacter()
  showCharacterCanvas.value = true
  await loadScenarios()
  store.phase = 'scenario-select'
})

async function loadScenarios() {
  try {
    availableScenarios.value = await client.getScenarios()
  } catch (err) {
    console.error('[App] Failed to load scenarios:', err)
    availableScenarios.value = []
  }
}

async function handleScenarioSelect(scenarioId: string) {
  await unlockAudio()
  store.messages = []
  store.phase = 'teaching'
  store.isThinking = true

  try {
    store.sessionId = store.connectionId
    await sendToBackend({
      type: 'lesson.start',
      scenarioId,
      stream: true
    })
  } catch (err) {
    console.error('[App] Failed to start scenario:', err)
    store.isThinking = false
  }
}

async function handleSwitchScenario() {
  interruptTeacher()
  store.currentScenario = null
  store.messages = []
  await loadScenarios()
  store.phase = 'scenario-select'
}

function handleReplay(messageId: string) {
  const message = store.messages.find(item => item.id === messageId)
  if (!message) return

  if (store.ttsSource === 'remote' && message.audioBase64) {
    replayAudio(message.audioBase64)
    return
  }
  audioPlayer.speak(message.text, { lang: 'en-US' })
}

const activeWord = ref<string | null>(null)
const wordExplanation = ref<WordExplanation | null>(null)
const wordLoading = ref(false)
const wordError = ref<string | null>(null)

async function handleSpeakWord(word: string) {
  if (!word) return

  if (store.ttsSource === 'remote') {
    try {
      const { arrayBuffer, format } = await client.synthesizeSpeech(word)
      await replayAudio(await blobToBase64(new Blob([arrayBuffer])), format)
      return
    } catch (err) {
      console.error('[App] Remote word TTS failed, using browser speech:', err)
    }
  }
  audioPlayer.speak(word, { lang: 'en-US' })
}

async function handleWordDetail({ word, sentence }: { word: string; sentence?: string }) {
  activeWord.value = word
  wordExplanation.value = null
  wordError.value = null
  wordLoading.value = true
  try {
    wordExplanation.value = await client.explainWord(word, sentence)
  } catch (err) {
    console.error('[App] Failed to explain word:', err)
    wordError.value = '查询失败，请稍后重试。'
  } finally {
    wordLoading.value = false
  }
}

function closeWordDetail() {
  activeWord.value = null
  wordExplanation.value = null
  wordError.value = null
  wordLoading.value = false
}

async function sendText(text: string) {
  interruptTeacher()
  client.emit('message.user', { text, isVoice: false })
  client.emit('state.thinking', undefined)

  try {
    await sendToBackend({ type: 'user.speak', text, stream: true })
  } catch (err) {
    console.error('[App] Failed to send message:', err)
    store.isThinking = false
    store.messages.push({
      id: createMessageId(),
      role: 'assistant',
      text: err instanceof Error ? err.message : '发送失败，请重试',
      timestamp: Date.now()
    })
  }
}
</script>
