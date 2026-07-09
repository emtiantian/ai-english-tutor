// @ts-nocheck
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTutorStore } from '../tutor'
import {
  scenarioPausedDB,
  __resetScenarioPausedDBForTest,
} from '../../lib/scenario-paused-db'

describe('TutorStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('should have default state', () => {
    const store = useTutorStore()
    expect(store.phase).toBe('loading')
    expect(store.isConnected).toBe(false)
    expect(store.isThinking).toBe(false)
    expect(store.messages).toEqual([])
  })

  it('should add user message', () => {
    const store = useTutorStore()
    store.addUserMessage('Hello')

    expect(store.messages).toHaveLength(1)
    expect(store.messages[0].role).toBe('user')
    expect(store.messages[0].text).toBe('Hello')
  })

  it('should start and append stream', () => {
    const store = useTutorStore()
    store.startAssistantStream()

    expect(store.messages).toHaveLength(1)
    expect(store.messages[0].isStreaming).toBe(true)

    store.appendStreamChunk('Hello')
    store.appendStreamChunk(' world')

    expect(store.messages[0].text).toBe('Hello world')
  })

  it('should finalize stream', () => {
    const store = useTutorStore()
    store.startAssistantStream()
    store.appendStreamChunk('Hello')
    store.finalizeStream({
      text: 'Hello!',
      vocabulary: ['hello'],
      vocabularySentences: ['Hello example.'],
      studentReplyHints: ['Hi back!'],
    })

    expect(store.messages[0].isStreaming).toBe(false)
    expect(store.messages[0].vocabulary).toEqual(['hello'])
    expect(store.messages[0].vocabularySentences).toEqual(['Hello example.'])
    expect(store.messages[0].studentReplyHints).toEqual(['Hi back!'])
  })

  it('should add complete message when no streaming exists', () => {
    const store = useTutorStore()
    expect(store.messages).toHaveLength(0)

    store.finalizeStream({ text: 'Direct response!', vocabulary: ['direct'] })

    expect(store.messages).toHaveLength(1)
    expect(store.messages[0].role).toBe('assistant')
    expect(store.messages[0].text).toBe('Direct response!')
    expect(store.messages[0].isStreaming).toBe(false)
    expect(store.messages[0].vocabulary).toEqual(['direct'])
  })

  it('should track connection state', () => {
    const store = useTutorStore()
    store.isConnected = true
    expect(store.isConnected).toBe(true)
    store.isConnected = false
    expect(store.isConnected).toBe(false)
  })
})

// =====================================================================
// v2：场景重构相关单测
// =====================================================================

describe('TutorStore v2 — scenario redesign', () => {
  let nowSpy: ReturnType<typeof vi.spyOn>
  const T0 = 1_700_000_000_000

  beforeEach(async () => {
    setActivePinia(createPinia())
    localStorage.clear()
    nowSpy = vi.spyOn(Date, 'now').mockReturnValue(T0)

    // 清空 IndexedDB 残留
    nowSpy.mockReturnValue(T0 + 1e15)
    await scenarioPausedDB.cleanupExpired()
    nowSpy.mockReturnValue(T0)
    __resetScenarioPausedDBForTest()
  })

  function makeScenarioProgress(overrides = {}) {
    return {
      id: 'restaurant-ordering',
      name: '餐厅点餐',
      icon: '🍽️',
      targetWords: ['hello', 'coffee', 'tea', 'water'],
      targetWordsTotal: 4,
      wordsLearned: ['hello', 'coffee'],
      level: 'A2' as const,
      turnsCount: 8,
      maxTurns: 20,
      ...overrides,
    }
  }

  it('computed: 派生 currentScenarioLevel/currentTurn/maxTurns/coverageRate/currentStars', () => {
    const store = useTutorStore()
    store.setScenario(makeScenarioProgress({ wordsLearned: ['hello', 'coffee', 'tea'] })) // 3/4 = 75%
    expect(store.currentScenarioLevel).toBe('A2')
    expect(store.currentTurn).toBe(8)
    expect(store.maxTurns).toBe(20)
    expect(store.coverageRate).toBeCloseTo(0.75)
    expect(store.currentStars).toBe(4)
  })

  it('computed: stars 阶梯按覆盖率落档', () => {
    const store = useTutorStore()
    const cases: Array<[number, 0 | 3 | 4 | 5]> = [
      [4, 5], // 4/4 = 100%
      [3, 4], // 3/4 = 75%
      [2, 0], // 2/4 = 50% — 不足 60%
    ]
    for (const [hit, expected] of cases) {
      const words = ['hello', 'coffee', 'tea', 'water'].slice(0, hit)
      store.setScenario(makeScenarioProgress({ wordsLearned: words }))
      expect(store.currentStars).toBe(expected)
    }
  })

  it('coverageRate 后端下发优先于本地推断', () => {
    const store = useTutorStore()
    store.setScenario(makeScenarioProgress({ coverageRate: 0.92 }))
    expect(store.coverageRate).toBeCloseTo(0.92)
    expect(store.currentStars).toBe(5)
  })

  it('pauseCurrentScenario: <6 轮直接放弃，不写 IndexedDB', async () => {
    const store = useTutorStore()
    store.setScenario(makeScenarioProgress({ turnsCount: 5 }))
    const ok = await store.pauseCurrentScenario('sess-1')
    expect(ok).toBe(false)
    expect(await scenarioPausedDB.getPausedSnapshot('restaurant-ordering')).toBeNull()
  })

  it('pauseCurrentScenario: ≥6 轮保存到 IndexedDB 并填到 store map', async () => {
    const store = useTutorStore()
    store.setScenario(makeScenarioProgress({ turnsCount: 8 }))
    const ok = await store.pauseCurrentScenario('sess-2')
    expect(ok).toBe(true)

    const snap = await scenarioPausedDB.getPausedSnapshot('restaurant-ordering')
    expect(snap).not.toBeNull()
    expect(snap.serverSessionId).toBe('sess-2')
    expect(snap.turnsCount).toBe(8)

    expect(store.pausedSnapshots.has('restaurant-ordering')).toBe(true)
  })

  it('switchScenario: 保存快照后切回 scenario-select', async () => {
    const store = useTutorStore()
    store.setScenario(makeScenarioProgress({ turnsCount: 8 }))
    store.phase = 'teaching'

    const result = await store.switchScenario('sess-3')
    expect(result.paused).toBe(true)
    expect(store.currentScenario).toBeNull()
    expect(store.phase).toBe('scenario-select')
  })

  it('switchScenario: 当前 <6 轮，paused=false', async () => {
    const store = useTutorStore()
    store.setScenario(makeScenarioProgress({ turnsCount: 3 }))
    store.phase = 'teaching'

    const result = await store.switchScenario()
    expect(result.paused).toBe(false)
    expect(store.phase).toBe('scenario-select')
  })

  it('discardPausedSnapshot: 同时清 IndexedDB 和 store map', async () => {
    const store = useTutorStore()
    store.setScenario(makeScenarioProgress({ turnsCount: 8 }))
    await store.pauseCurrentScenario('sess-x')
    expect(store.pausedSnapshots.has('restaurant-ordering')).toBe(true)

    await store.discardPausedSnapshot('restaurant-ordering')
    expect(store.pausedSnapshots.has('restaurant-ordering')).toBe(false)
    expect(await scenarioPausedDB.getPausedSnapshot('restaurant-ordering')).toBeNull()
  })

  it('applyResumedSnapshot: 把快照还原到 currentScenario 并切到 teaching', () => {
    const store = useTutorStore()
    store.applyResumedSnapshot({
      scenarioId: 'shopping',
      level: 'B1',
      turnsCount: 12,
      maxTurns: 20,
      wordsUsed: ['want', 'much'],
      targetWords: ['want', 'much', 'big', 'small'],
      serverSessionId: 'sess-r',
      savedAt: T0,
      expiresAt: T0 + 1000,
    })
    expect(store.phase).toBe('teaching')
    expect(store.currentScenario.id).toBe('shopping')
    expect(store.currentScenarioLevel).toBe('B1')
    expect(store.currentTurn).toBe(12)
    expect(store.coverageRate).toBeCloseTo(0.5)
  })

  it('recordScenarioCompletion: stars≥3 升级 highestClearedLevel + 持久化 localStorage', async () => {
    const store = useTutorStore()
    await store.recordScenarioCompletion('restaurant-ordering', 'A2', 4)

    const progress = store.userScenarioProgress.get('restaurant-ordering')
    expect(progress.highestClearedLevel).toBe('A2')
    expect(progress.starsByLevel.A2).toBe(4)
    expect(progress.attempts).toBe(1)

    // 确认写到 localStorage
    const raw = localStorage.getItem('tutor_user_scenario_progress_v2')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw)[0].scenarioId).toBe('restaurant-ordering')
  })

  it('recordScenarioCompletion: stars=0 不升级 highestClearedLevel，但 attempts 累加', async () => {
    const store = useTutorStore()
    await store.recordScenarioCompletion('restaurant-ordering', 'A2', 0)

    const progress = store.userScenarioProgress.get('restaurant-ordering')
    expect(progress.highestClearedLevel).toBeNull()
    expect(progress.starsByLevel.A2).toBeUndefined()
    expect(progress.attempts).toBe(1)
  })

  it('recordScenarioCompletion: 多次通关取较高星数与较高 CEFR', async () => {
    const store = useTutorStore()
    await store.recordScenarioCompletion('restaurant-ordering', 'A2', 5)
    await store.recordScenarioCompletion('restaurant-ordering', 'A2', 3) // 不应降星
    await store.recordScenarioCompletion('restaurant-ordering', 'B1', 4)

    const progress = store.userScenarioProgress.get('restaurant-ordering')
    expect(progress.starsByLevel.A2).toBe(5)
    expect(progress.starsByLevel.B1).toBe(4)
    expect(progress.highestClearedLevel).toBe('B1')
    expect(progress.attempts).toBe(3)
  })

  it('getNextChallengeLevel: 没通关过 → 返回 fallback；通关 A2 → B1；通关 C2 → null', async () => {
    const store = useTutorStore()
    expect(store.getNextChallengeLevel('restaurant-ordering', 'A2')).toBe('A2')

    await store.recordScenarioCompletion('restaurant-ordering', 'A2', 4)
    expect(store.getNextChallengeLevel('restaurant-ordering', 'A2')).toBe('B1')

    await store.recordScenarioCompletion('restaurant-ordering', 'C2', 5)
    expect(store.getNextChallengeLevel('restaurant-ordering', 'A2')).toBeNull()
  })

  it('challengeNextLevel: 还有更高档 → phase=teaching；C2 已通关 → phase=scenario-select', async () => {
    const store = useTutorStore()
    await store.recordScenarioCompletion('restaurant-ordering', 'A2', 4)
    expect(store.challengeNextLevel('restaurant-ordering', 'A2')).toBe('B1')
    expect(store.phase).toBe('teaching')

    await store.recordScenarioCompletion('restaurant-ordering', 'C2', 5)
    expect(store.challengeNextLevel('restaurant-ordering', 'A2')).toBeNull()
    expect(store.phase).toBe('scenario-select')
  })

  it('loadPausedSnapshots: 启动时从 IndexedDB 拉所有未过期快照填 map', async () => {
    // 直接走 db 写两条
    await scenarioPausedDB.savePausedSnapshot({
      scenarioId: 'a',
      level: 'A1',
      turnsCount: 7,
      maxTurns: 20,
      wordsUsed: [],
      targetWords: [],
    })
    await scenarioPausedDB.savePausedSnapshot({
      scenarioId: 'b',
      level: 'A2',
      turnsCount: 8,
      maxTurns: 20,
      wordsUsed: [],
      targetWords: [],
    })

    const store = useTutorStore()
    expect(store.pausedSnapshots.size).toBe(0)
    await store.loadPausedSnapshots()
    expect(store.pausedSnapshots.size).toBe(2)
    expect(store.pausedSnapshots.has('a')).toBe(true)
    expect(store.pausedSnapshots.has('b')).toBe(true)
  })

  it('userScenarioProgress 启动时从 localStorage 还原', () => {
    localStorage.setItem(
      'tutor_user_scenario_progress_v2',
      JSON.stringify([
        {
          scenarioId: 'shopping',
          highestClearedLevel: 'B1',
          starsByLevel: { A2: 5, B1: 4 },
          attempts: 3,
          lastPlayedAt: T0,
        },
      ]),
    )
    const store = useTutorStore()
    const progress = store.userScenarioProgress.get('shopping')
    expect(progress).toBeDefined()
    expect(progress.highestClearedLevel).toBe('B1')
    expect(progress.starsByLevel.A2).toBe(5)
  })
})
