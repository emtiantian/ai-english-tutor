import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CEFRLevel } from '@ai-english-tutor/shared'
import type { UserScenarioProgress } from '../client/types'
import { scenarioPausedDB, type ScenarioPausedSnapshot } from '../lib/scenario-paused-db'

/** v2: 暂停快照需要的最小轮次门槛（< 6 轮直接放弃） */
export const MIN_TURNS_FOR_PAUSE = 6
/** v2: 默认硬上限轮次 */
export const DEFAULT_MAX_TURNS = 20
/** v2：userScenarioProgress 的 localStorage 键 */
const USER_SCENARIO_PROGRESS_KEY = 'tutor_user_scenario_progress_v2'
/** v2: CEFR 顺序，用于晋级计算 */
const CEFR_ORDER: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

/**
 * 场景持久化 store（v2）
 *
 * 从 useTutorStore 拆出的纯持久化 + 进度计算层：
 *  - pausedSnapshots：IndexedDB 暂停快照（24h 过期，续玩用）
 *  - userScenarioProgress：每个场景的累积通关进度（localStorage）
 *
 * 不持有运行时状态（currentScenario / phase 仍在 tutor store），
 * 所有方法都是参数化的，由 tutor store 的编排动作调用。
 */
export const useScenarioProgressStore = defineStore('scenarioProgress', () => {
  /** 启动时从 IndexedDB 加载的所有未过期暂停快照（场景 picker 用） */
  const pausedSnapshots = ref<Map<string, ScenarioPausedSnapshot>>(new Map())

  /** 用户每个场景的累积进度（最高通关档 + 各档星数）。持久化到 localStorage */
  const userScenarioProgress = ref<Map<string, UserScenarioProgress>>(loadUserScenarioProgress())

  function loadUserScenarioProgress(): Map<string, UserScenarioProgress> {
    try {
      const raw = localStorage.getItem(USER_SCENARIO_PROGRESS_KEY)
      if (!raw) return new Map()
      const arr = JSON.parse(raw) as UserScenarioProgress[]
      return new Map(arr.map(p => [p.scenarioId, p]))
    } catch {
      return new Map()
    }
  }

  function persistUserScenarioProgress() {
    try {
      const arr = Array.from(userScenarioProgress.value.values())
      localStorage.setItem(USER_SCENARIO_PROGRESS_KEY, JSON.stringify(arr))
    } catch {
      // localStorage 写失败（容量/隐私模式）忽略
    }
  }

  /**
   * 启动时从 IndexedDB 加载所有未过期的暂停快照到 store，
   * 并顺手清理过期的。供 ScenarioPicker 渲染暂停徽章。
   */
  async function loadPausedSnapshots(): Promise<void> {
    try {
      const list = await scenarioPausedDB.listAllPaused()
      const map = new Map<string, ScenarioPausedSnapshot>()
      for (const snap of list) map.set(snap.scenarioId, snap)
      pausedSnapshots.value = map
    } catch {
      // IndexedDB 不可用（隐私模式）忽略
      pausedSnapshots.value = new Map()
    }
  }

  /**
   * 保存暂停快照（同 scenarioId 已存在则覆盖）。
   * 写 IndexedDB + 同步更新 store map（不重新 list，避免 race）。
   */
  async function savePausedSnapshot(
    snapshot: Omit<ScenarioPausedSnapshot, 'savedAt' | 'expiresAt'>
  ): Promise<void> {
    try {
      await scenarioPausedDB.savePausedSnapshot(snapshot)
      const now = Date.now()
      pausedSnapshots.value = new Map(pausedSnapshots.value).set(snapshot.scenarioId, {
        ...snapshot,
        savedAt: now,
        expiresAt: now + 24 * 60 * 60 * 1000
      })
    } catch {
      // 忽略
    }
  }

  /**
   * 用户选"重新开始"或场景通关后，丢弃该场景的暂停快照（幂等）。
   */
  async function discardPausedSnapshot(scenarioId: string): Promise<void> {
    try {
      await scenarioPausedDB.deletePausedSnapshot(scenarioId)
    } catch {
      // 忽略
    }
    if (pausedSnapshots.value.has(scenarioId)) {
      const next = new Map(pausedSnapshots.value)
      next.delete(scenarioId)
      pausedSnapshots.value = next
    }
  }

  /**
   * 通关后调用--更新用户在该场景的累积进度（最高通关档 + 星数）。
   * 仅当 stars >= 3（达标）才升级 highestClearedLevel。
   * 同时清理该场景的暂停快照（已通关，旧暂停作废）。
   */
  async function recordScenarioCompletion(
    scenarioId: string,
    level: CEFRLevel,
    stars: 0 | 3 | 4 | 5
  ): Promise<void> {
    const existing = userScenarioProgress.value.get(scenarioId)
    const next: UserScenarioProgress = existing
      ? { ...existing, starsByLevel: { ...existing.starsByLevel } }
      : {
          scenarioId,
          highestClearedLevel: null,
          starsByLevel: {},
          attempts: 0,
          lastPlayedAt: 0
        }
    next.attempts += 1
    next.lastPlayedAt = Date.now()

    if (stars >= 3) {
      // stars >= 3 已在运行时排除 0，但 TS 不会从 0|3|4|5 narrow 掉 0，cast 一下
      const passingStars = stars as 3 | 4 | 5
      // 升级 starsByLevel：取较大值
      const prevStars = next.starsByLevel[level] ?? 0
      if (passingStars > prevStars) {
        next.starsByLevel[level] = passingStars
      }
      // 升级 highestClearedLevel：取较高 CEFR
      const prevIdx = next.highestClearedLevel ? CEFR_ORDER.indexOf(next.highestClearedLevel) : -1
      const curIdx = CEFR_ORDER.indexOf(level)
      if (curIdx > prevIdx) {
        next.highestClearedLevel = level
      }
    }

    userScenarioProgress.value = new Map(userScenarioProgress.value).set(scenarioId, next)
    persistUserScenarioProgress()

    // 通关后清理该场景的暂停快照
    await discardPausedSnapshot(scenarioId)
  }

  /**
   * 算下一档要挑战的 CEFR。
   * - 没通关过 -> 返回用户档（fallbackLevel），让首次玩家从自己档开始
   * - 已通关过 -> 返回 highestClearedLevel + 1
   * - 已通关 C2 -> 返回 null（已封顶）
   */
  function getNextChallengeLevel(scenarioId: string, fallbackLevel: CEFRLevel): CEFRLevel | null {
    const progress = userScenarioProgress.value.get(scenarioId)
    if (!progress || !progress.highestClearedLevel) return fallbackLevel
    const idx = CEFR_ORDER.indexOf(progress.highestClearedLevel)
    if (idx < 0 || idx >= CEFR_ORDER.length - 1) return null // C2 已通关
    return CEFR_ORDER[idx + 1]
  }

  return {
    pausedSnapshots,
    userScenarioProgress,
    loadPausedSnapshots,
    savePausedSnapshot,
    discardPausedSnapshot,
    recordScenarioCompletion,
    getNextChallengeLevel
  }
})
