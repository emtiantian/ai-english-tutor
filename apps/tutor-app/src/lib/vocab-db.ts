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
  operationId: string
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

function createOperationId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `vocab-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
}

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
  /** 首次保存单词并在同一事务中写入同步 outbox。 */
  async saveWordForSync(word: string): Promise<boolean> {
    const db = await getDB()
    const tx = db.transaction(['words', 'pending-sync'], 'readwrite')
    const existing = await tx.objectStore('words').get(word)
    if (existing) {
      await tx.done
      return false
    }
    const now = Date.now()
    await tx.objectStore('words').put({
      word,
      learnedAt: now,
      reviewCount: 0,
      lastReviewAt: 0,
      synced: false
    } as VocabRecord)
    await tx.objectStore('pending-sync').add({
      operationId: createOperationId(),
      word,
      action: 'learn',
      timestamp: now
    } as PendingSyncRecord)
    await tx.done
    return true
  },

  /** 幂等保存已学单词；返回是否是首次写入。 */
  async saveWord(word: string): Promise<boolean> {
    const db = await getDB()
    const existing = await db.get('words', word)
    if (existing) {
      return false
    }
    await db.put('words', {
      word,
      learnedAt: Date.now(),
      reviewCount: 0,
      lastReviewAt: 0,
      synced: false
    } as VocabRecord)
    return true
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
      operationId: createOperationId(),
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
  }

  // legacy scenario-progress object store 保留，避免仅为删旧 store 升级 IndexedDB 版本。
}
