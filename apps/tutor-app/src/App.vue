<template>
  <div class="app-root">
    <OfflineBanner />
    <SvgLoading v-if="showSvg" />
    <canvas
      ref="characterCanvas"
      class="absolute inset-0 w-full h-full opacity-0 transition-opacity-800ms z-1 md:(top-auto bottom-0 h-55% w-full)"
      :class="{ 'opacity-100': showCharacterCanvas }"
    />

    <!-- Chat Messages -->
    <ChatMessageList
      v-if="store.phase === 'teaching'"
      :messages="store.messages"
      :is-playing="store.isPlaying"
      @replay="handleReplay"
      @replay-chinese="handleReplayChinese"
    />

    <!-- Scenario Picker (includes style selector + v2 progress dots + resume dialog) -->
    <ScenarioPicker
      v-if="store.phase === 'scenario-select'"
      :scenarios="availableScenarios"
      :style-name="pendingStyleName"
      :user-level="userCEFRLevel"
      :paused-snapshots="store.pausedSnapshots"
      :user-scenario-progress="store.userScenarioProgress"
      @select="handleScenarioSelect"
      @resume="handleScenarioResume"
      @free-chat="handleFreeChat"
    />

    <!-- Scenario Complete -->
    <ScenarioComplete
      v-if="store.phase === 'scenario-complete' && store.currentScenario"
      :scenario="store.currentScenario"
      :is-capped="isScenarioCapped"
      @retry="handleScenarioRetry"
      @challenge="handleScenarioChallenge"
      @next="handleNextScenario"
    />

    <LevelResult
      v-if="store.phase === 'assess-result'"
      :level="store.currentLevel ?? 1"
      @confirm="handleLevelConfirm"
    />

    <!-- Text Display Timing Switch -->
    <div v-if="store.phase === 'teaching'" class="absolute top-10px right-10px z-20">
      <label class="flex items-center gap-8px text-white/70 text-12px cursor-pointer">
        <span>{{ store.showTextImmediately ? '实时显示文字' : '语音结束后显示' }}</span>
        <button
          class="w-40px h-22px rounded-11px border-none bg-white/20 relative cursor-pointer transition-background-300 p-0"
          :class="{ 'bg-primary-80': store.showTextImmediately }"
          @click="store.setShowTextImmediately(!store.showTextImmediately)"
        >
          <span
            class="absolute top-2px left-2px w-18px h-18px rounded-full bg-white transition-transform-300 shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
            :class="{ 'translate-x-18px': store.showTextImmediately }"
          ></span>
        </button>
      </label>
    </div>

    <!-- Bottom Input Bar (with integrated scenario status strip + switch scenario) -->
    <ChatInputBar
      v-if="store.phase === 'teaching'"
      :is-recording="isRecording"
      :is-encoding="isEncoding"
      :recording-duration="recordingDuration"
      :scenario="store.currentScenario"
      :student-reply-hints="lastStudentReplyHints"
      :vocabulary-sentences="lastVocabularySentences"
      :last-vocabulary="lastVocabulary"
      @send-text="sendText"
      @record-start="startRecording"
      @record-stop="stopRecording"
      @switch-scenario="handleSwitchScenario"
    />

    <!-- Thinking Indicator (only in teaching phase, not during assessment) -->
    <div v-if="store.isThinking && store.phase === 'teaching'" class="absolute left-1/2 -translate-x-1/2 z-15 glass-sm px-16px py-8px text-white/80 text-13px flex items-center gap-6px"
      :style="{ bottom: '100px' }"
    >
      <span class="dot-blink"></span>
      <span class="dot-blink animate-delay-200"></span>
      <span class="dot-blink animate-delay-400"></span>
      正在思考...
    </div>

    <!-- Connection Status -->
    <div v-if="!store.isConnected && store.phase === 'teaching'" class="absolute top-10px right-10px z-20 px-12px py-6px rounded-12px text-12px font-500 bg-danger-80 text-white">
      连接断开
    </div>

    <!-- Live2D Model Switcher (only after initial loading; live2d-only) -->
    <CharacterModelSwitcher
      v-if="!showSvg && showCharacterCanvas"
      :current-model-id="currentLive2DModelId"
      :is-switching="isSwitchingModel"
      :show-at-lower-position="store.phase === 'teaching'"
      @switch="handleSwitchLive2DModel"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useTutorStore } from './stores/tutor'
import { useTutorClient } from './composables/useTutorClient'
import { useCharacterProvider } from './composables/useCharacterProvider'
import { useAudioPlayback } from './composables/useAudioPlayback'
import { useAudioRecorder } from './composables/useAudioRecorder'
import { useASRConfig } from './composables/useASRConfig'
import { useVocabSync } from './composables/useVocabSync'
import SvgLoading from './components/SvgLoading.vue'
import ChatMessageList from './components/ChatMessageList.vue'
import ChatInputBar from './components/ChatInputBar.vue'
import ScenarioPicker from './components/ScenarioPicker.vue'
import ScenarioComplete from './components/ScenarioComplete.vue'
import OfflineBanner from './components/OfflineBanner.vue'
import LevelResult from './components/LevelResult.vue'
import CharacterModelSwitcher from './components/CharacterModelSwitcher.vue'
import { SpeechSynthesisTTSProvider } from './providers/speech-synthesis-tts'
import { RemoteTeacherProvider } from './providers/remote-teacher'
import type { ChatRequestBody } from './client/types'
import type { CEFRLevel } from '@ai-english-tutor/shared'
import type { ScenarioPausedSnapshot } from './lib/scenario-paused-db'

const store = useTutorStore()

/** Pick the most recent assistant message's vocabulary example sentences */
const lastVocabularySentences = computed(() => {
  for (let i = store.messages.length - 1; i >= 0; i--) {
    const msg = store.messages[i]
    if (msg.role === 'assistant' && msg.vocabularySentences && msg.vocabularySentences.length > 0) {
      return msg.vocabularySentences
    }
  }
  return undefined
})

/** Pick the most recent assistant message's student reply hints (powers 💡 hint, primary source) */
const lastStudentReplyHints = computed(() => {
  for (let i = store.messages.length - 1; i >= 0; i--) {
    const msg = store.messages[i]
    if (msg.role === 'assistant' && msg.studentReplyHints && msg.studentReplyHints.length > 0) {
      return msg.studentReplyHints
    }
  }
  return undefined
})

/** Pick the most recent assistant message's vocabulary list (used when sentences are missing) */
const lastVocabulary = computed(() => {
  for (let i = store.messages.length - 1; i >= 0; i--) {
    const msg = store.messages[i]
    if (msg.role === 'assistant' && msg.vocabulary && msg.vocabulary.length > 0) {
      return msg.vocabulary
    }
  }
  return undefined
})

const showSvg = ref(true)
const showCharacterCanvas = ref(false)
const characterCanvas = ref<HTMLCanvasElement | null>(null)

// Scenario state
const availableScenarios = ref<Array<{ id: string; name: string; nameEn: string; icon: string }>>([])
const currentScenarioId = ref<string | null>(null)

// v2: CEFR <-> numeric level mapping
const LEVEL_TO_CEFR: Record<number, CEFRLevel> = {
  1: 'A1', 2: 'A2', 3: 'B1', 4: 'B2', 5: 'C1', 6: 'C2',
}
const CEFR_TO_LEVEL: Record<CEFRLevel, number> = {
  A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6,
}

/** v2: 把用户当前 numeric level 映射为 CEFR，未设置时默认 A1 */
const userCEFRLevel = computed<CEFRLevel>(() => {
  return LEVEL_TO_CEFR[store.currentLevel ?? 1] ?? 'A1'
})

/** v2: 当前场景是否已通关 C2（封顶） */
const isScenarioCapped = computed(() => {
  if (!store.currentScenario) return false
  return store.getNextChallengeLevel(store.currentScenario.id, userCEFRLevel.value) === null
})

// Pending selections (set before assessment, used after level confirmation)
const pendingScenarioId = ref<string | null>(null)
const pendingStyleName = ref<string | undefined>(undefined)
const pendingTargetLevel = ref<CEFRLevel | undefined>(undefined)

// Late-binding ref: populated after useVocabSync, read by SSE handler at runtime
let _learnWords: ((words: string[]) => Promise<void>) | null = null

// Backend communication — must init first (sets store.ttsSource from env)
const { client } = useTutorClient({
  onLearnWords: (words) => { _learnWords?.(words) },
})

// Composable modules — each manages its own lifecycle
const { learnWords, restoreScenarioProgress } = useVocabSync(client)
_learnWords = learnWords

const { audioPlayer, replayAudio, unlockAudio } = useAudioPlayback(client)
// Load ASR provider config from /api/config so the recorder knows whether to
// run browser-side SpeechRecognition or send audio to the backend.
const { asrProvider } = useASRConfig()
const { isRecording, isEncoding, recordingDuration, requestType: recordRequestType, startRecording, stopRecording } = useAudioRecorder(client, sendToBackend, () => asrProvider.value)
const { init: initCharacter, switchLive2DModel, currentLive2DModelId, isSwitching: isSwitchingModel } = useCharacterProvider(characterCanvas, client)

// --- Helpers ---
async function sendToBackend(payload: Partial<ChatRequestBody> & { type: ChatRequestBody['type'] }) {
  // Voice requests need more time: ASR + LLM + TTS can take 30-60s
  const timeoutMs = payload.audioBase64 ? 120000 : undefined
  return client.sendMessage({
    level: store.currentLevel ?? 1,
    // Always use connectionId as sessionId — this is the SSE scoping key.
    // The backend uses this same ID for session lookup and SSE broadcast targeting.
    sessionId: store.connectionId,
    userId: store.userId,
    ...payload,
  }, timeoutMs)
}

onMounted(async () => {
  // Create remote teacher provider
  const teacher = new RemoteTeacherProvider(client)

  // Start loading character provider in parallel with SVG animation
  const characterLoad = initCharacter()

  // Wait for SVG animation (~3 seconds) while character loads in parallel
  await new Promise(resolve => setTimeout(resolve, 3200))

  // Wait for character provider to finish loading
  await characterLoad
  showCharacterCanvas.value = true

  // Set providers (character already set by composable)
  store.ttsProvider = new SpeechSynthesisTTSProvider()
  store.teacherProvider = teacher

  // SVG fade out
  showSvg.value = false

  // Restore confirmed level if returning user
  const confirmedLevel = localStorage.getItem('tutor_level_confirmed')
  if (confirmedLevel) {
    store.currentLevel = parseInt(confirmedLevel)
  }

  // Always show scenario picker after loading (scenario selection comes first)
  setTimeout(async () => {
    await fetchScenarios()
    store.phase = 'scenario-select'
  }, 600)
})

// --- Fetch all scenarios from backend (no level filter) ---
async function fetchScenarios() {
  try {
    const baseUrl = import.meta.env.VITE_BACKEND_URL || ''
    const response = await fetch(`${baseUrl}/api/scenarios`)
    const data = await response.json()
    availableScenarios.value = data.scenarios ?? []
  } catch (err) {
    console.error('[App] Failed to fetch scenarios:', err)
    availableScenarios.value = []
  }
}

// --- Scenario selected → start teaching at the chosen CEFR level ---
async function handleScenarioSelect(
  scenarioId: string,
  options: { styleName?: string; level: CEFRLevel },
) {
  pendingScenarioId.value = scenarioId
  pendingStyleName.value = options.styleName
  pendingTargetLevel.value = options.level
  currentScenarioId.value = scenarioId

  await unlockAudio()

  store.messages = []
  // 把用户全局 level 同步为本次进入的 CEFR 档（首次访问时设置）
  store.confirmLevel(CEFR_TO_LEVEL[options.level])
  await startTeaching()
}

// --- Resume a paused scenario ---
async function handleScenarioResume(snapshot: ScenarioPausedSnapshot, styleName?: string) {
  pendingScenarioId.value = snapshot.scenarioId
  pendingStyleName.value = styleName
  pendingTargetLevel.value = snapshot.level
  currentScenarioId.value = snapshot.scenarioId

  store.applyResumedSnapshot(snapshot)
  await unlockAudio()
  await startTeaching(snapshot.serverSessionId)
}

// --- Switch scenario from ChatInputBar ---
async function handleSwitchScenario() {
  await store.switchScenario(store.sessionId ?? undefined)
  // switchScenario 已更新 pausedSnapshots 并把 phase 切到 scenario-select
  await fetchScenarios()
}

// --- Free chat → directly show difficulty selection ---
async function handleFreeChat(styleName?: string) {
  pendingScenarioId.value = null
  pendingStyleName.value = styleName
  pendingTargetLevel.value = undefined
  currentScenarioId.value = null

  await unlockAudio()

  store.messages = []
  store.phase = 'assess-result'
}

// --- Level confirmed → start teaching with pending scenario ---
async function handleLevelConfirm(level: number) {
  store.confirmLevel(level)
  await startTeaching()
}

// --- Start teaching with stored scenario/style/level ---
async function startTeaching(resumeFrom?: string) {
  store.phase = 'teaching'
  store.messages = []
  store.isThinking = true

  try {
    const response = await sendToBackend({
      type: 'lesson.start',
      level: store.currentLevel ?? 1,
      ...(pendingScenarioId.value ? { scenarioId: pendingScenarioId.value } : {}),
      ...(pendingStyleName.value ? { styleName: pendingStyleName.value } : {}),
      ...(pendingTargetLevel.value ? { targetLevel: pendingTargetLevel.value } : {}),
      ...(resumeFrom ? { resumeFrom } : {}),
    })

    if (response.sessionId) {
      store.sessionId = response.sessionId
    }

    // The opening message, scenario updates and thinking-state reset are
    // handled by the SSE `teacher.response` event in useTutorClient.
  } catch (err) {
    console.error('[App] Failed to start teaching:', err)
    store.isThinking = false
  }
}

// --- Scenario completed actions ---
function handleScenarioRetry() {
  if (currentScenarioId.value) {
    const level = store.currentScenarioLevel ?? undefined
    store.clearScenario()
    store.messages = []
    pendingScenarioId.value = currentScenarioId.value
    pendingTargetLevel.value = level
    startTeaching()
  }
}

function handleScenarioChallenge() {
  const scenario = store.currentScenario
  if (!scenario) return
  const nextLevel = store.challengeNextLevel(scenario.id, userCEFRLevel.value)
  if (!nextLevel) {
    handleNextScenario()
    return
  }
  pendingScenarioId.value = scenario.id
  pendingStyleName.value = undefined
  pendingTargetLevel.value = nextLevel
  currentScenarioId.value = scenario.id
  store.messages = []
  startTeaching()
}

function handleNextScenario() {
  store.clearScenario()
  store.messages = []
  pendingTargetLevel.value = undefined
  // Show scenario picker again
  fetchScenarios().then(() => {
    store.phase = 'scenario-select'
  })
}

// --- Live2D model switching ---
async function handleSwitchLive2DModel(modelId: string) {
  await switchLive2DModel(modelId)
}

// --- Replay audio ---
function handleReplay(messageId: string) {
  const msg = store.messages.find(m => m.id === messageId)
  if (!msg) return

  if (store.ttsSource === 'remote' && msg.audioBase64) {
    replayAudio(msg.audioBase64)
  } else {
    audioPlayer.speak(msg.text, { lang: 'en-US' })
  }
}

async function handleReplayChinese(messageId: string) {
  const msg = store.messages.find(m => m.id === messageId)
  if (!msg) return

  if (store.ttsSource === 'remote' && msg.chineseAudioBase64) {
    replayAudio(msg.chineseAudioBase64)
  } else {
    const text = msg.textZh || msg.text
    if (text) {
      audioPlayer.speak(text, { lang: 'zh-CN' })
    }
  }
}

// --- Send text ---
async function sendText(text: string) {
  client.emit('message.user', { text, isVoice: false })
  client.emit('state.thinking', undefined)

  // When streaming, SSE handles message finalization and scenario updates.
  // Fire-and-forget the HTTP request — only await for error handling.
  try {
    await sendToBackend({ type: 'user.speak', text, stream: true })
  } catch (err) {
    console.error('[App] sendText failed:', err)
    store.isThinking = false
    store.messages.push({
      id: `msg-${Date.now()}`,
      role: 'assistant',
      text: err instanceof Error ? err.message : '发送失败，请重试',
      timestamp: Date.now(),
    })
  }

}
</script>

<style scoped>
.app-root {
  width: 100%;
  height: 100vh;
  height: 100dvh; /* iOS Safari: dynamic viewport height excludes address bar */
  background: #000;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

/* Vue transition (can't be expressed as utility classes) */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.5s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
