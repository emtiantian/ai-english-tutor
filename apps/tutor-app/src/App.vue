<template>
  <div class="app-root">
    <OfflineBanner />
    <canvas
      ref="characterCanvas"
      class="absolute inset-0 w-full h-full opacity-0 transition-opacity-800ms z-1 md:(top-auto bottom-0 h-55% w-full)"
      :class="{ 'opacity-100': showCharacterCanvas }"
    />

    <!-- 聊天消息 -->
    <ChatMessageList
      v-if="store.phase === 'teaching'"
      :messages="store.messages"
      :is-playing="store.isPlaying"
      @replay="handleReplay"
      @speak-word="handleSpeakWord"
      @word-detail="handleWordDetail"
    />

    <!-- 单词详情弹窗 -->
    <WordDetailModal
      v-if="activeWord"
      :word="activeWord"
      :explanation="wordExplanation"
      :loading="wordLoading"
      :error="wordError"
      @close="closeWordDetail"
      @speak="handleSpeakWord(activeWord)"
    />

    <!-- 场景选择器（含风格选择、v2 进度点与续玩弹窗） -->
    <ScenarioPicker
      v-if="store.phase === 'scenario-select'"
      :scenarios="availableScenarios"
      :style-name="pendingStyleName"
      :voice-style-selectable="voiceStyleSelectable"
      :user-level="userCEFRLevel"
      :paused-snapshots="scenarioProgress.pausedSnapshots"
      :user-scenario-progress="scenarioProgress.userScenarioProgress"
      @select="handleScenarioSelect"
      @resume="handleScenarioResume"
      @free-chat="handleFreeChat"
    />

    <!-- 场景完成 -->
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

    <!-- 文字显示时机开关 -->
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

    <!-- 底部输入栏（含场景状态条与切换场景按钮） -->
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

    <!-- 思考指示器（仅在教学阶段显示，评估时不显示） -->
    <div v-if="store.isThinking && store.phase === 'teaching'" class="absolute left-1/2 -translate-x-1/2 z-15 glass-sm px-16px py-8px text-white/80 text-13px flex items-center gap-6px"
      :style="{ bottom: '100px' }"
    >
      <span class="dot-blink"></span>
      <span class="dot-blink animate-delay-200"></span>
      <span class="dot-blink animate-delay-400"></span>
      正在思考...
    </div>

    <!-- 连接状态 -->
    <div v-if="!store.isConnected && store.phase === 'teaching'" class="absolute top-10px right-10px z-20 px-12px py-6px rounded-12px text-12px font-500 bg-danger-80 text-white">
      连接断开
    </div>

    <!-- Live2D 模型切换器（仅在初始加载完成后显示；仅 Live2D 可用） -->
    <CharacterModelSwitcher
      v-if="showCharacterCanvas"
      :current-model-id="currentLive2DModelId"
      :is-switching="isSwitchingModel"
      :show-at-lower-position="store.phase === 'teaching'"
      @switch="handleSwitchLive2DModel"
    />

    <!-- DEV-only 动作/表情调试面板 -->
    <MotionDebugPanel
      v-if="isDev && showCharacterCanvas"
      :show-at-lower-position="store.phase === 'teaching'"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, provide, shallowRef } from 'vue'
import { useTutorStore } from './stores/tutor'
import { useScenarioProgressStore } from './stores/scenario-progress'
import { useTutorClient } from './composables/useTutorClient'
import { useCharacterProvider } from './composables/useCharacterProvider'
import { useAudioPlayback } from './composables/useAudioPlayback'
import { useAudioRecorder } from './composables/useAudioRecorder'
import { useASRConfig } from './composables/useASRConfig'
import { useVocabSync } from './composables/useVocabSync'
import ChatMessageList from './components/ChatMessageList.vue'
import WordDetailModal from './components/WordDetailModal.vue'
import ChatInputBar from './components/ChatInputBar.vue'
import ScenarioPicker from './components/ScenarioPicker.vue'
import ScenarioComplete from './components/ScenarioComplete.vue'
import OfflineBanner from './components/OfflineBanner.vue'
import LevelResult from './components/LevelResult.vue'
import CharacterModelSwitcher from './components/CharacterModelSwitcher.vue'
import MotionDebugPanel from './components/MotionDebugPanel.vue'
import type { ChatRequestBody, WordExplanation } from './client/types'
import type { CEFRLevel, CharacterProvider } from '@ai-english-tutor/shared'
import type { ScenarioPausedSnapshot } from './lib/scenario-paused-db'
import { createMessageId } from './lib/message-utils.js'
import { useCurrentHint } from './composables/useCurrentHint'

const store = useTutorStore()
const scenarioProgress = useScenarioProgressStore()

/** 仅开发环境显示动作/表情调试面板 */
const isDev = import.meta.env.DEV

const showCharacterCanvas = ref(false)
const characterCanvas = ref<HTMLCanvasElement | null>(null)

// --- 建议话术（💡 提示） ---
const { suggestedPhrase } = useCurrentHint({
  messages: computed(() => store.messages),
  targetWords: computed(() => store.currentScenario?.targetWords),
  wordsLearned: computed(() => store.currentScenario?.wordsLearned),
})

// 场景状态
const availableScenarios = ref<Array<{ id: string; name: string; nameEn: string; icon: string }>>([])
const currentScenarioId = ref<string | null>(null)

// v2: CEFR 与数字等级映射
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
  return scenarioProgress.getNextChallengeLevel(store.currentScenario.id, userCEFRLevel.value) === null
})

// 待生效选项（评估前设置，等级确认后使用）
const pendingScenarioId = ref<string | null>(null)
const pendingStyleName = ref<string | undefined>(undefined)
const pendingTargetLevel = ref<CEFRLevel | undefined>(undefined)

// 延迟绑定引用：在 useVocabSync 后赋值，运行时由 SSE 处理器读取
let _learnWords: ((words: string[]) => Promise<void>) | null = null

// 后端通信 — 必须先初始化（会从环境变量设置 store.ttsSource）
// 角色 Provider 响应式引用：前置声明，供 useTutorClient / useAudioPlayback /
// useAudioRecorder 共享；useCharacterProvider 在 init/切换时写入实例。
// Provider 实例不再经过 Pinia store 传递。
const characterProvider = shallowRef<CharacterProvider | null>(null)

const { client } = useTutorClient({
  characterProvider,
  onLearnWords: (words) => { _learnWords?.(words) },
})

// 可组合模块 — 各自管理自身生命周期
const { learnWords } = useVocabSync(client)
_learnWords = learnWords

const { audioPlayer, replayAudio, unlockAudio } = useAudioPlayback(client, characterProvider)
// 从 /api/config 加载 ASR/TTS 运行时配置。
const { asrProvider, voiceStyleSelectable } = useASRConfig()
const { isRecording, isEncoding, recordingDuration, startRecording, stopRecording } = useAudioRecorder(client, sendToBackend, () => asrProvider.value, characterProvider)
const { init: initCharacter, switchLive2DModel, currentLive2DModelId, isSwitching: isSwitchingModel } = useCharacterProvider(characterCanvas, client, characterProvider)

// 向深层组件提供 character provider（避免通过 Pinia store 传递实例）
provide('characterProvider', characterProvider)

// --- 辅助函数 ---
async function sendToBackend(payload: Partial<ChatRequestBody> & { type: ChatRequestBody['type'] }) {
  // 语音请求需要更多时间：ASR + LLM + TTS 可能需要 30-60 秒
  const timeoutMs = payload.audioBase64 ? 120000 : undefined
  return client.sendMessage({
    level: store.currentLevel ?? 1,
    // 始终使用 connectionId 作为 sessionId — 这是 SSE 作用域键。
    // 后端使用同一个 ID 进行会话查找和 SSE 广播定向。
    sessionId: store.connectionId,
    userId: store.userId,
    ...payload,
  }, timeoutMs)
}

onMounted(async () => {
  // 与加载动画并行开始加载角色 Provider。
  const characterLoad = initCharacter()
  await characterLoad

  // 角色 Provider 已就绪；显示画布。
  showCharacterCanvas.value = true

  // 如果是回头用户，恢复已确认等级
  const confirmedLevel = localStorage.getItem('tutor_level_confirmed')
  if (confirmedLevel) {
    store.currentLevel = parseInt(confirmedLevel)
  }

  // 加载完成后始终显示场景选择器（先选场景）
  setTimeout(async () => {
    await fetchScenarios()
    // 从 IndexedDB 恢复未过期的暂停快照，供 ScenarioPicker 显示「续玩」徽章
    await scenarioProgress.loadPausedSnapshots()
    store.phase = 'scenario-select'
  }, 600)
})

// --- 从后端获取全部场景（不按等级过滤） ---
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

// --- 场景已选择 → 按所选 CEFR 等级开始教学 ---
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

// --- 续玩暂停的场景 ---
async function handleScenarioResume(snapshot: ScenarioPausedSnapshot, styleName?: string) {
  pendingScenarioId.value = snapshot.scenarioId
  pendingStyleName.value = styleName
  pendingTargetLevel.value = snapshot.level
  currentScenarioId.value = snapshot.scenarioId

  store.applyResumedSnapshot(snapshot)
  await unlockAudio()
  await startTeaching(snapshot.serverSessionId)
}

// --- 从聊天输入栏切换场景 ---
async function handleSwitchScenario() {
  await store.switchScenario(store.sessionId ?? undefined)
  // switchScenario 已更新 pausedSnapshots 并把 phase 切到 scenario-select
  await fetchScenarios()
}

// --- 自由聊天 → 直接显示难度选择 ---
async function handleFreeChat(styleName?: string) {
  pendingScenarioId.value = null
  pendingStyleName.value = styleName
  pendingTargetLevel.value = undefined
  currentScenarioId.value = null

  await unlockAudio()

  store.messages = []
  store.phase = 'assess-result'
}

// --- 等级已确认 → 用待生效场景开始教学 ---
async function handleLevelConfirm(level: number) {
  store.confirmLevel(level)
  await startTeaching()
}

// --- 用已保存的场景/风格/等级开始教学 ---
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

    // 开场白、场景更新和思考状态重置
    // 由 useTutorClient 中的 SSE teacher.response 事件处理。
  } catch (err) {
    console.error('[App] Failed to start teaching:', err)
    store.isThinking = false
  }
}

// --- 场景完成后的操作 ---
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
  // 再次显示场景选择器
  fetchScenarios().then(() => {
    store.phase = 'scenario-select'
  })
}

// --- Live2D 模型切换 ---
async function handleSwitchLive2DModel(modelId: string) {
  await switchLive2DModel(modelId)
}

// --- 重放音频 ---
function handleReplay(messageId: string) {
  const msg = store.messages.find(m => m.id === messageId)
  if (!msg) return

  if (store.ttsSource === 'remote' && msg.audioBase64) {
    replayAudio(msg.audioBase64)
  } else {
    audioPlayer.speak(msg.text, { lang: 'en-US' })
  }
}

// --- 单词：发音 + 详情弹窗 ---
const activeWord = ref<string | null>(null)
const wordExplanation = ref<WordExplanation | null>(null)
const wordLoading = ref(false)
const wordError = ref<string | null>(null)

function handleSpeakWord(word: string) {
  if (!word) return
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
    console.error('[App] explainWord failed:', err)
    wordError.value = '离线或查询失败，请稍后再试。'
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

// --- 发送文字 ---
async function sendText(text: string) {
  client.emit('message.user', { text, isVoice: false })
  client.emit('state.thinking', undefined)

  // 流式场景下，SSE 负责消息最终化和场景更新。
  // HTTP 请求走即发即忘模式 — 仅等待以处理错误。
  try {
    await sendToBackend({ type: 'user.speak', text, stream: true })
  } catch (err) {
    console.error('[App] sendText failed:', err)
    store.isThinking = false
    store.messages.push({
      id: createMessageId(),
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
  height: 100dvh; /* iOS Safari：动态视口高度会排除地址栏 */
  background: #000;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

/* Vue 过渡动画（无法用工具类表达） */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.5s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
