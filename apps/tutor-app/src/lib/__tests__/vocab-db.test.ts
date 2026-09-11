import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { vocabDB } from '../vocab-db'

describe('vocabDB', () => {
  it('saves repeated scenario snapshots idempotently', async () => {
    const word = `snapshot-${Date.now()}-${Math.random()}`

    expect(await vocabDB.saveWord(word)).toBe(true)
    expect(await vocabDB.saveWord(word)).toBe(false)

    const record = (await vocabDB.getAllWords()).find(item => item.word === word)
    expect(record?.reviewCount).toBe(0)
  })

  it('writes a new word and its sync operation atomically', async () => {
    const word = `outbox-${Date.now()}-${Math.random()}`

    expect(await vocabDB.saveWordForSync(word)).toBe(true)
    expect(await vocabDB.saveWordForSync(word)).toBe(false)

    const pending = (await vocabDB.getPendingSyncs()).filter(item => item.word === word)
    expect(pending).toHaveLength(1)
    expect(pending[0].action).toBe('learn')
  })
})
