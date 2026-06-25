/**
 * 场景暂停快照的浏览器 IndexedDB 持久化层（v2）
 *
 * 当用户在场景对话中点"换场景"且当前轮次 ≥6 时，把当前场景状态快照
 * 保存到浏览器（24h 过期），下次回到这个场景可以续玩。**纯前端**，
 * 不走后端。
 *
 * 风格参考 ./vocab-db.ts：单例 dbPromise + 一个对象导出 API。
 */

import { openDB, type IDBPDatabase } from 'idb'
import type { CEFRLevel } from '@ai-english-tutor/shared'

export interface ScenarioPausedSnapshot {
  /** 主键：场景 ID */
  scenarioId: string
  /** 当前 CEFR 档 */
  level: CEFRLevel
  /** 暂停时已进行的轮次 */
  turnsCount: number
  /** 硬上限轮次（通常 20） */
  maxTurns: number
  /** 已命中的目标词 */
  wordsUsed: string[]
  /** 本场抽到的 30 个目标词 */
  targetWords: string[]
  /** 后端 sessionId（恢复时让后端续会话用） */
  serverSessionId?: string
  /** 保存时间戳（ms） */
  savedAt: number
  /** 过期时间戳（ms，savedAt + 24h） */
  expiresAt: number
}

const DB_NAME = 'english-tutor-scenario-paused'
const DB_VERSION = 1
const STORE = 'snapshots'
/** 24 hours */
export const SCENARIO_PAUSED_TTL_MS = 24 * 60 * 60 * 1000

let dbPromise: Promise<IDBPDatabase> | null = null

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'scenarioId' })
        }
      },
    })
  }
  return dbPromise
}

/** 测试钩子：重置单例 dbPromise，让下一次 getDB 重新打开（fake-indexeddb 重置后用） */
export function __resetScenarioPausedDBForTest(): void {
  dbPromise = null
}

export const scenarioPausedDB = {
  /**
   * 保存暂停快照（同 scenarioId 已存在则覆盖）。
   * 自动填 savedAt = now、expiresAt = now + 24h。
   */
  async savePausedSnapshot(
    snapshot: Omit<ScenarioPausedSnapshot, 'savedAt' | 'expiresAt'>,
  ): Promise<void> {
    const db = await getDB()
    const now = Date.now()
    const full: ScenarioPausedSnapshot = {
      ...snapshot,
      savedAt: now,
      expiresAt: now + SCENARIO_PAUSED_TTL_MS,
    }
    await db.put(STORE, full)
  },

  /**
   * 读取一个场景的暂停快照。若已过期，自动删除并返回 null。
   */
  async getPausedSnapshot(scenarioId: string): Promise<ScenarioPausedSnapshot | null> {
    const db = await getDB()
    const record = (await db.get(STORE, scenarioId)) as ScenarioPausedSnapshot | undefined
    if (!record) return null
    if (record.expiresAt <= Date.now()) {
      await db.delete(STORE, scenarioId)
      return null
    }
    return record
  },

  /** 删除一个场景的暂停快照（幂等） */
  async deletePausedSnapshot(scenarioId: string): Promise<void> {
    const db = await getDB()
    await db.delete(STORE, scenarioId)
  },

  /**
   * 列出所有未过期的快照。读取时顺手清理已过期记录。
   */
  async listAllPaused(): Promise<ScenarioPausedSnapshot[]> {
    const db = await getDB()
    const all = (await db.getAll(STORE)) as ScenarioPausedSnapshot[]
    const now = Date.now()
    const alive: ScenarioPausedSnapshot[] = []
    const expiredIds: string[] = []
    for (const rec of all) {
      if (rec.expiresAt <= now) expiredIds.push(rec.scenarioId)
      else alive.push(rec)
    }
    if (expiredIds.length) {
      const tx = db.transaction(STORE, 'readwrite')
      for (const id of expiredIds) await tx.store.delete(id)
      await tx.done
    }
    return alive
  },

  /**
   * 清理所有已过期记录。返回清理的数量。
   * 启动时可异步调用一次做后台清理。
   */
  async cleanupExpired(): Promise<number> {
    const db = await getDB()
    const all = (await db.getAll(STORE)) as ScenarioPausedSnapshot[]
    const now = Date.now()
    const expiredIds = all.filter((r) => r.expiresAt <= now).map((r) => r.scenarioId)
    if (!expiredIds.length) return 0
    const tx = db.transaction(STORE, 'readwrite')
    for (const id of expiredIds) await tx.store.delete(id)
    await tx.done
    return expiredIds.length
  },
}
