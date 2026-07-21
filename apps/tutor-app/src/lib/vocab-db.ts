import { openDB, type IDBPDatabase } from 'idb'

interface VocabRecord {
  word: string
  learnedAt: number
  reviewCount: number
  lastReviewAt: number
  synced: boolean
}

interface PendingSyncRecord {
  id?: number
  word: string
  action: 'learn' | 'review'
  timestamp: number
}

// === IndexedDB 数据库结构（DB_NAME='english-tutor-vocab'，版本 1）===
// - 'words' store：以 word 为主键，记录 learnedAt / reviewCount / lastReviewAt / synced
// - 'pending-sync' store：自增 id 主键，离线时暂存待同步的 learn/review 动作
// - 'scenario-progress' store：以 scenarioId 为主键，缓存每个场景已学单词列表
// getDB() 单例化 dbPromise，避免重复打开连接。
const DB_NAME = 'english-tutor-vocab'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase> | null = null

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('words')) {
          db.createObjectStore('words', { keyPath: 'word' })
        }
        if (!db.objectStoreNames.contains('pending-sync')) {
          db.createObjectStore('pending-sync', {
            keyPath: 'id',
            autoIncrement: true
          })
        }
        if (!db.objectStoreNames.contains('scenario-progress')) {
          db.createObjectStore('scenario-progress', { keyPath: 'scenarioId' })
        }
      }
    })
  }
  return dbPromise
}

export const vocabDB = {
  /** 保存已学单词（幂等） */
  async saveWord(word: string): Promise<void> {
    const db = await getDB()
    const existing = await db.get('words', word)
    if (existing) {
      existing.reviewCount++
      existing.lastReviewAt = Date.now()
      await db.put('words', existing)
    } else {
      await db.put('words', {
        word,
        learnedAt: Date.now(),
        reviewCount: 1,
        lastReviewAt: Date.now(),
        synced: false
      } as VocabRecord)
    }
  },

  /** 获取所有已学单词记录 */
  async getAllWords(): Promise<VocabRecord[]> {
    const db = await getDB()
    return db.getAll('words')
  },

  /** 获取已学单词列表（仅 word 字符串） */
  async getLearnedWords(): Promise<string[]> {
    const db = await getDB()
    const records = await db.getAll('words')
    return records.map(r => r.word)
  },

  /** 标记单词已同步到后端 */
  async markSynced(word: string): Promise<void> {
    const db = await getDB()
    const record = await db.get('words', word)
    if (record) {
      record.synced = true
      await db.put('words', record)
    }
  },

  /** 添加到待同步队列 */
  async addPendingSync(word: string, action: 'learn' | 'review'): Promise<void> {
    const db = await getDB()
    await db.add('pending-sync', {
      word,
      action,
      timestamp: Date.now()
    } as PendingSyncRecord)
  },

  /** 获取所有待同步记录 */
  async getPendingSyncs(): Promise<PendingSyncRecord[]> {
    const db = await getDB()
    return db.getAll('pending-sync')
  },

  /** 清除已同步的待同步记录 */
  async clearSynced(syncedIds: number[]): Promise<void> {
    const db = await getDB()
    const tx = db.transaction('pending-sync', 'readwrite')
    for (const id of syncedIds) {
      await tx.store.delete(id)
    }
    await tx.done
  },

  /** 保存场景进度快照 */
  async saveScenarioProgress(scenarioId: string, wordsLearned: string[]): Promise<void> {
    const db = await getDB()
    // IndexedDB 的 structured clone 不能序列化 Vue reactive Proxy，
    // 写入前先转成普通数组。
    await db.put('scenario-progress', {
      scenarioId,
      wordsLearned: Array.from(wordsLearned),
      savedAt: Date.now()
    })
  },

  /** 恢复场景进度 */
  async getScenarioProgress(scenarioId: string): Promise<string[] | null> {
    const db = await getDB()
    const record = await db.get('scenario-progress', scenarioId)
    return record?.wordsLearned ?? null
  },

  /** 清除场景进度 */
  async clearScenarioProgress(scenarioId: string): Promise<void> {
    const db = await getDB()
    await db.delete('scenario-progress', scenarioId)
  }
}
