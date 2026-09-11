import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TTSSource, CEFRLevel } from '@ai-english-tutor/shared'
import type { ScenarioProgress } from '../client/types'
import type { ScenarioPausedSnapshot } from '../lib/scenario-paused-db'
import { createMessageId } from '../lib/message-utils.js'
import { computeCoverageRate } from '../lib/scenario-utils.js'
import {
  useScenarioProgressStore,
  MIN_TURNS_FOR_PAUSE,
  DEFAULT_MAX_TURNS
} from './scenario-progress.js'

export type AppPhase =
  'loading' | 'ready' | 'assess-result' | 'scenario-select' | 'teaching' | 'scenario-complete'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  transcript?: string // 显示在语音消息下方的 ASR 识别文本
  textZh?: string
  isStreaming?: boolean
  vocabulary?: string[]
  vocabularySentences?: string[]
  /** 学习者口吻的回复建议（用于 💡 提示）。每轮临时有效。 */
  studentReplyHints?: string[]
  timestamp: number
  visible?: boolean // false = 等待语音结束后显示
  audioBase64?: string // 用于重听
  /** 发送该消息时的场景进度快照 */
  scenario?: ScenarioProgress
}

export const useTutorStore = defineStore('tutor', () => {
  // === 状态 ===
  // phase 状态机驱动整个 UI 渲染（App.vue 按 phase 条件渲染各组件）：
  //   loading -> scenario-select -> teaching -> scenario-complete -> scenario-select
  //   自由聊天分支：scenario-select -> assess-result -> ready -> teaching
  // 各阶段对应组件：scenario-select=ScenarioPicker / teaching=ChatMessageList+ChatInputBar
  //   / scenario-complete=ScenarioComplete / assess-result=LevelResult
  const phase = ref<AppPhase>('loading')
  const isConnected = ref(false)
  const isThinking = ref(false)
  const isPlaying = ref(false)
  /** 打断标志：true 时可能抑制 in-flight 分片（配合 interruptedAtEpoch 按代判断） */
  const interrupted = ref(false)
  /** 请求代：每次发起用户请求 ++，用于区分新旧请求的流式分片 */
  const requestEpoch = ref(0)
  /** 打断态对应的请求代（被打断的请求），仅抑制同代 in-flight 分片，不影响新请求流式 */
  const interruptedAtEpoch = ref(0)
  const messages = ref<ChatMessage[]>([])
  const ttsSource = ref<TTSSource>('local')
  const sessionId = ref<string | null>(null)
  const currentLevel = ref<number | null>(null)

  // === 用户 ID（自动生成，持久化到 localStorage） ===
  const userId = ref<string>(getOrCreateUserId())

  function getOrCreateUserId(): string {
    const storageKey = 'tutor_user_id'
    let id = localStorage.getItem(storageKey)
    if (!id) {
      id = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      localStorage.setItem(storageKey, id)
    }
    return id
  }

  // === Session ID（每个标签页唯一，标识本次浏览会话） ===
  // 持久化到 sessionStorage，页面刷新（F5）后仍然保留，但关闭标签页后丢失。
  // 这是 SSE 连接键 - 不是后端返回的课程 sessionId。
  const connectionId = getOrCreateConnectionId()

  function getOrCreateConnectionId(): string {
    const storageKey = 'tutor_connection_id'
    let id = sessionStorage.getItem(storageKey)
    if (!id) {
      id = `conn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      sessionStorage.setItem(storageKey, id)
    }
    return id
  }

  // === 场景运行时状态 ===
  // 持久化层（暂停快照 / 用户通关进度）已拆到 useScenarioProgressStore，
  // 这里只保留当前进行中的场景运行时状态 + 编排动作。
  const currentScenario = ref<ScenarioProgress | null>(null)

  /** v2 computed: 当前挑战的 CEFR 档（来自后端 scenario.level，未下发返回 null） */
  const currentScenarioLevel = computed<CEFRLevel | null>(() => {
    return currentScenario.value?.level ?? null
  })

  /** v2 computed: 硬上限轮次（后端未下发时回退默认 20） */
  const maxTurns = computed<number>(() => {
    return currentScenario.value?.maxTurns ?? DEFAULT_MAX_TURNS
  })

  /** v2 computed: 词覆盖率 0-1（优先用后端给的 coverageRate，否则现算） */
  const coverageRate = computed<number>(() => {
    const sc = currentScenario.value
    if (!sc) return 0
    return computeCoverageRate(sc.wordsLearned, sc.targetWordsTotal, sc.coverageRate)
  })

  // === 文字显示时机开关 ===
  const showTextImmediately = ref(true)

  // === 带副作用的操作 ===
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
    const msg: ChatMessage = {
      id: createMessageId(),
      role: 'assistant',
      text: '',
      isStreaming: true,
      timestamp: Date.now()
    }
    messages.value.push(msg)
    isThinking.value = false
  }

  function appendStreamChunk(chunk: string) {
    if (!showTextImmediately.value) return
    const lastMsg = messages.value[messages.value.length - 1]
    if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
      lastMsg.text += chunk
    }
  }

  function finalizeStream(response: {
    text: string
    textZh?: string
    motionId?: string
    expressionId?: string
    vocabulary?: string[]
    vocabularySentences?: string[]
    studentReplyHints?: string[]
  }) {
    const scenarioSnapshot = currentScenario.value ? { ...currentScenario.value } : undefined
    const lastMsg = messages.value[messages.value.length - 1]
    if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
      lastMsg.text = response.text
      lastMsg.textZh = response.textZh
      lastMsg.isStreaming = false
      lastMsg.vocabulary = response.vocabulary
      lastMsg.vocabularySentences = response.vocabularySentences
      lastMsg.studentReplyHints = response.studentReplyHints
      lastMsg.scenario = scenarioSnapshot
      if (!showTextImmediately.value) {
        lastMsg.visible = false
      }
    } else {
      messages.value.push({
        id: createMessageId(),
        role: 'assistant',
        text: showTextImmediately.value ? response.text : '',
        textZh: response.textZh,
        isStreaming: false,
        visible: showTextImmediately.value,
        vocabulary: response.vocabulary,
        vocabularySentences: response.vocabularySentences,
        studentReplyHints: response.studentReplyHints,
        scenario: scenarioSnapshot,
        timestamp: Date.now()
      })
    }
  }

  function showDelayedMessage() {
    for (let i = messages.value.length - 1; i >= 0; i--) {
      const msg = messages.value[i]
      if (msg.role === 'assistant' && msg.visible === false) {
        msg.visible = true
        break
      }
    }
  }

  /**
   * 用户打断当前老师回复：把残留的 streaming 消息定稿（保留已显示的半句文本），
   * 置 interrupted=true 抑制后续 in-flight 分片，并清掉思考态。
   * 由 SSE teacher.interrupted 事件触发。
   */
  function markStreamingInterrupted() {
    for (let i = messages.value.length - 1; i >= 0; i--) {
      const msg = messages.value[i]
      if (msg.role === 'assistant' && msg.isStreaming) {
        msg.isStreaming = false
        break
      }
    }
    interrupted.value = true
    // 记录被打断请求的代：仅抑制同代 in-flight 分片，新请求（代不同）的流式不受影响
    interruptedAtEpoch.value = requestEpoch.value
    isThinking.value = false
  }

  function setShowTextImmediately(value: boolean) {
    showTextImmediately.value = value
  }

  /** 设置当前场景 */
  async function setScenario(scenario: ScenarioProgress | null) {
    const wasComplete = currentScenario.value?.completed === true
    currentScenario.value = scenario
    if (scenario?.completed && !wasComplete) {
      phase.value = 'scenario-complete'
      // 通关/失败后把结果持久化到 scenarioProgress store，并清理暂停快照
      if (scenario.level && scenario.stars !== undefined) {
        const progress = useScenarioProgressStore()
        await progress.recordScenarioCompletion(scenario.id, scenario.level, scenario.stars)
      }
    }
  }

  /** 清空场景状态 */
  function clearScenario() {
    currentScenario.value = null
    phase.value = 'ready'
  }

  /**
   * v2: 把当前进行中的场景保存为暂停快照（用户点"换场景"时调用）。
   * 仅当当前轮次 ≥ MIN_TURNS_FOR_PAUSE 才保存；否则视为放弃，仅清理本地。
   * 返回是否保存了快照。持久化写入由 scenarioProgress store 负责。
   */
  async function pauseCurrentScenario(serverSessionId?: string): Promise<boolean> {
    const sc = currentScenario.value
    if (!sc) return false
    const turns = sc.turnsCount ?? 0
    if (turns < MIN_TURNS_FOR_PAUSE) return false
    // 后端未下发 level 时不保存快照（无法恢复）
    if (!sc.level) return false

    const progress = useScenarioProgressStore()
    await progress.savePausedSnapshot({
      scenarioId: sc.id,
      level: sc.level,
      turnsCount: turns,
      maxTurns: sc.maxTurns ?? DEFAULT_MAX_TURNS,
      wordsUsed: [...sc.wordsLearned],
      targetWords: [...sc.targetWords],
      serverSessionId
    })
    return true
  }

  /**
   * v2: 用户选"续玩"，把暂停快照应用到当前 scenario 状态。
   * 实际后端续会话由调用方（App.vue）触发；此处只做本地状态还原。
   */
  function applyResumedSnapshot(snapshot: ScenarioPausedSnapshot): void {
    currentScenario.value = {
      id: snapshot.scenarioId,
      // name/icon 由 ScenarioPicker 拼出来；这里仅占位，后端首次回复会覆盖
      name: snapshot.scenarioId,
      icon: '',
      targetWords: [...snapshot.targetWords],
      targetWordsTotal: snapshot.targetWords.length,
      wordsLearned: [...snapshot.wordsUsed],
      level: snapshot.level,
      turnsCount: snapshot.turnsCount,
      maxTurns: snapshot.maxTurns,
      coverageRate:
        snapshot.targetWords.length === 0
          ? 0
          : snapshot.wordsUsed.length / snapshot.targetWords.length
    }
    phase.value = 'teaching'
  }

  /** 为最后一条用户语音消息设置识别文本 */
  function setLastUserTranscript(transcript: string) {
    for (let i = messages.value.length - 1; i >= 0; i--) {
      const msg = messages.value[i]
      if (msg.role === 'user') {
        msg.transcript = transcript
        break
      }
    }
  }

  /**
   * v2: 用户在对话界面点"换场景"按钮的统一入口。
   *  - 当前轮次 ≥ MIN_TURNS_FOR_PAUSE -> 保存暂停快照
   *  - 否则 -> 直接放弃
   * 之后切回 scenario-select phase，让用户重新挑场景。
   * 后端会话清理由调用方负责。
   */
  async function switchScenario(serverSessionId?: string): Promise<{ paused: boolean }> {
    const paused = await pauseCurrentScenario(serverSessionId)
    currentScenario.value = null
    phase.value = 'scenario-select'
    return { paused }
  }

  /**
   * v2: 通关弹窗"挑战下一档"按钮的状态切换。
   * 仅做本地状态准备：清掉当前 scenario，切回 teaching phase。
   * 实际下一场会话的发起（带 nextLevel + scenarioId）由调用方触发。
   * 返回算出的下一档（C2 已通关时返回 null）。
   */
  function challengeNextLevel(scenarioId: string, fallbackLevel: CEFRLevel): CEFRLevel | null {
    const progress = useScenarioProgressStore()
    const next = progress.getNextChallengeLevel(scenarioId, fallbackLevel)
    currentScenario.value = null
    phase.value = next ? 'teaching' : 'scenario-select'
    return next
  }

  function confirmLevel(level: number) {
    currentLevel.value = level
    localStorage.setItem('tutor_level_confirmed', String(level))
    phase.value = 'ready'
  }

  return {
    // 状态（refs 在 Pinia 中可直接修改）
    phase,
    isConnected,
    isThinking,
    isPlaying,
    messages,
    ttsSource,
    sessionId,
    currentLevel,
    userId,
    connectionId,
    // 打断
    interrupted,
    requestEpoch,
    interruptedAtEpoch,
    markStreamingInterrupted,
    // 文字显示时机
    showTextImmediately,
    // 场景运行时状态（持久化见 useScenarioProgressStore）
    currentScenario,
    currentScenarioLevel,
    maxTurns,
    coverageRate,
    // 操作
    addUserMessage,
    startAssistantStream,
    appendStreamChunk,
    finalizeStream,
    showDelayedMessage,
    setShowTextImmediately,
    setScenario,
    clearScenario,
    pauseCurrentScenario,
    applyResumedSnapshot,
    setLastUserTranscript,
    confirmLevel,
    // v2 场景编排动作（持久化委托 useScenarioProgressStore）
    switchScenario,
    challengeNextLevel
  }
})
