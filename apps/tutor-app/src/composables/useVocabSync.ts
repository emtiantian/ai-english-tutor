import { watch } from 'vue'
import { vocabDB } from '../lib/vocab-db'
import { useOnlineStatus } from './useOnlineStatus'
import type { TutorClient } from '../client/TutorClient'
import { useTutorStore } from '../stores/tutor'

/**
 * 词汇同步 composable
 *
 * 管理词汇的本地持久化和后端同步：
 * - 学会的单词存入 IndexedDB
 * - 离线时积累到待同步队列
 * - 上线时自动批量同步
 */
export function useVocabSync(client: TutorClient) {
  const { isOnline } = useOnlineStatus()
  const store = useTutorStore()

  /** 记录学会的单词（本地持久化 + 尝试同步） */
  async function learnWords(words: string[]): Promise<void> {
    if (words.length === 0) return

    for (const word of words) {
      await vocabDB.saveWord(word)
    }

    // 保存场景进度快照
    if (store.currentScenario) {
      await vocabDB.saveScenarioProgress(
        store.currentScenario.id,
        // 避免把 Pinia reactive Proxy 传给 IndexedDB
        Array.from(store.currentScenario.wordsLearned)
      )
    }

    // 尝试同步
    if (isOnline.value) {
      try {
        await syncToBackend()
      } catch {
        // 同步失败，加入待同步队列
        for (const word of words) {
          await vocabDB.addPendingSync(word, 'learn')
        }
      }
    } else {
      // 离线，加入待同步队列
      for (const word of words) {
        await vocabDB.addPendingSync(word, 'learn')
      }
    }
  }

  /** 将待同步的词汇批量发送到后端 */
  async function syncToBackend(): Promise<void> {
    const pending = await vocabDB.getPendingSyncs()
    if (pending.length === 0) return

    console.log(`[VocabSync] Syncing ${pending.length} pending words to backend`)

    // 批量发送到独立词汇同步接口，避免占用聊天通道
    const words = pending.map(p => ({
      word: p.word,
      action: p.action,
      timestamp: p.timestamp
    }))
    const response = await client.syncVocabulary(store.userId, words)

    if (!response.success) {
      throw new Error('Vocabulary sync failed')
    }

    // 标记已同步
    const syncedIds = pending.map(p => p.id).filter((id): id is number => id !== undefined)
    await vocabDB.clearSynced(syncedIds)

    for (const p of pending) {
      if (p.action === 'learn') {
        await vocabDB.markSynced(p.word)
      }
    }

    console.log(`[VocabSync] Synced ${response.synced} words`)
  }

  /** 恢复场景进度 */
  async function restoreScenarioProgress(scenarioId: string): Promise<string[] | null> {
    return vocabDB.getScenarioProgress(scenarioId)
  }

  // 上线时自动同步
  watch(isOnline, online => {
    if (online) {
      console.log('[VocabSync] Back online, syncing...')
      syncToBackend().catch(err => {
        console.error('[VocabSync] Auto-sync failed:', err)
      })
    }
  })

  return {
    learnWords,
    syncToBackend,
    restoreScenarioProgress
  }
}
