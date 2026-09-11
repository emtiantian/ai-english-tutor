import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { TTSSource } from '@ai-english-tutor/shared'
import type { ScenarioProgress } from '../client/types.js'
import { createMessageId } from '../lib/message-utils.js'

export type AppPhase = 'loading' | 'scenario-select' | 'teaching'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  transcript?: string
  textZh?: string
  isStreaming?: boolean
  vocabulary?: string[]
  vocabularySentences?: string[]
  studentReplyHints?: string[]
  timestamp: number
  audioBase64?: string
  scenario?: ScenarioProgress
  visible?: boolean
}

function getConnectionId(): string {
  const storageKey = 'tutor_connection_id'
  const existing = sessionStorage.getItem(storageKey)
  if (existing) return existing

  const id = `conn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  sessionStorage.setItem(storageKey, id)
  return id
}

export const useTutorStore = defineStore('tutor', () => {
  const phase = ref<AppPhase>('loading')
  const isConnected = ref(false)
  const isThinking = ref(false)
  const isPlaying = ref(false)
  const interrupted = ref(false)
  const requestEpoch = ref(0)
  const interruptedAtEpoch = ref(0)
  const messages = ref<ChatMessage[]>([])
  const ttsSource = ref<TTSSource>('local')
  const sessionId = ref<string | null>(null)
  const connectionId = getConnectionId()
  const currentScenario = ref<ScenarioProgress | null>(null)

  function addUserMessage(text: string) {
    messages.value.push({
      id: createMessageId(),
      role: 'user',
      text,
      timestamp: Date.now(),
      scenario: currentScenario.value ? { ...currentScenario.value } : undefined
    })
  }

  function startAssistantStream() {
    messages.value.push({
      id: createMessageId(),
      role: 'assistant',
      text: '',
      isStreaming: true,
      timestamp: Date.now()
    })
    isThinking.value = false
  }

  function appendStreamChunk(chunk: string) {
    const message = messages.value.at(-1)
    if (message?.role === 'assistant' && message.isStreaming) {
      message.text += chunk
    }
  }

  function finalizeStream(response: {
    text: string
    textZh?: string
    vocabulary?: string[]
    vocabularySentences?: string[]
    studentReplyHints?: string[]
  }) {
    const scenario = currentScenario.value ? { ...currentScenario.value } : undefined
    const message = messages.value.at(-1)
    if (message?.role === 'assistant' && message.isStreaming) {
      Object.assign(message, {
        text: response.text,
        textZh: response.textZh,
        vocabulary: response.vocabulary,
        vocabularySentences: response.vocabularySentences,
        studentReplyHints: response.studentReplyHints,
        scenario,
        isStreaming: false
      })
      return
    }

    messages.value.push({
      id: createMessageId(),
      role: 'assistant',
      text: response.text,
      textZh: response.textZh,
      vocabulary: response.vocabulary,
      vocabularySentences: response.vocabularySentences,
      studentReplyHints: response.studentReplyHints,
      scenario,
      timestamp: Date.now()
    })
  }

  function markStreamingInterrupted() {
    const message = messages.value.at(-1)
    if (message?.role === 'assistant' && message.isStreaming) {
      message.isStreaming = false
    }
    interrupted.value = true
    interruptedAtEpoch.value = requestEpoch.value
    isThinking.value = false
  }

  function setScenario(scenario: ScenarioProgress | null) {
    currentScenario.value = scenario
  }

  function setLastUserTranscript(transcript: string) {
    const message = [...messages.value].reverse().find(item => item.role === 'user')
    if (message) message.transcript = transcript
  }

  return {
    phase,
    isConnected,
    isThinking,
    isPlaying,
    interrupted,
    requestEpoch,
    interruptedAtEpoch,
    messages,
    ttsSource,
    sessionId,
    connectionId,
    currentScenario,
    addUserMessage,
    startAssistantStream,
    appendStreamChunk,
    finalizeStream,
    markStreamingInterrupted,
    setScenario,
    setLastUserTranscript
  }
})
