/**
 * Tests for scenario-paused-db.ts
 *
 * 用 fake-indexeddb 提供 IndexedDB；用 vi.spyOn(Date, 'now') 控制时间
 * （不用 vi.useFakeTimers，因为它会 mock setTimeout，与 fake-indexeddb
 * 内部的微任务排队相互卡死）。
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import {
  scenarioPausedDB,
  __resetScenarioPausedDBForTest,
  SCENARIO_PAUSED_TTL_MS,
  type ScenarioPausedSnapshot,
} from '../scenario-paused-db'

const T0 = 1_700_000_000_000 // 任意固定时间戳

const baseSnap = (
  scenarioId: string,
  overrides: Partial<ScenarioPausedSnapshot> = {},
): Omit<ScenarioPausedSnapshot, 'savedAt' | 'expiresAt'> => ({
  scenarioId,
  level: 'A2',
  turnsCount: 8,
  maxTurns: 20,
  wordsUsed: ['hello', 'coffee'],
  targetWords: ['hello', 'coffee', 'thank', 'please'],
  serverSessionId: `sess-${scenarioId}`,
  ...overrides,
})

let nowSpy: ReturnType<typeof vi.spyOn>

function setNow(t: number) {
  nowSpy.mockReturnValue(t)
}

async function clearAll() {
  // 临时把"现在"推到所有记录的过期之后，让 listAllPaused 顺手把全部清掉
  const original = Date.now()
  nowSpy.mockReturnValue(original + 100 * SCENARIO_PAUSED_TTL_MS)
  await scenarioPausedDB.cleanupExpired()
  nowSpy.mockReturnValue(original)
}

describe('scenarioPausedDB', () => {
  beforeEach(() => {
    nowSpy = vi.spyOn(Date, 'now').mockReturnValue(T0)
  })

  afterEach(async () => {
    await clearAll()
    vi.restoreAllMocks()
    __resetScenarioPausedDBForTest()
  })

  it('save → get 往返：能取回相同字段并自动填 savedAt/expiresAt', async () => {
    await scenarioPausedDB.savePausedSnapshot(baseSnap('restaurant-ordering'))

    const got = await scenarioPausedDB.getPausedSnapshot('restaurant-ordering')
    expect(got).not.toBeNull()
    expect(got!.scenarioId).toBe('restaurant-ordering')
    expect(got!.level).toBe('A2')
    expect(got!.turnsCount).toBe(8)
    expect(got!.targetWords).toHaveLength(4)
    expect(got!.savedAt).toBe(T0)
    expect(got!.expiresAt).toBe(T0 + SCENARIO_PAUSED_TTL_MS)
  })

  it('save 同 scenarioId 两次：后者覆盖前者', async () => {
    await scenarioPausedDB.savePausedSnapshot(baseSnap('shopping', { turnsCount: 5 }))

    setNow(T0 + 1000)
    await scenarioPausedDB.savePausedSnapshot(baseSnap('shopping', { turnsCount: 12 }))

    const got = await scenarioPausedDB.getPausedSnapshot('shopping')
    expect(got!.turnsCount).toBe(12)
    expect(got!.savedAt).toBe(T0 + 1000)
  })

  it('getPausedSnapshot：过期记录返回 null 且被删除', async () => {
    await scenarioPausedDB.savePausedSnapshot(baseSnap('asking-directions'))

    setNow(T0 + SCENARIO_PAUSED_TTL_MS + 1)

    const got = await scenarioPausedDB.getPausedSnapshot('asking-directions')
    expect(got).toBeNull()

    // 即便回到 T0 之前再读，记录也已经被删
    setNow(T0)
    const stillGone = await scenarioPausedDB.getPausedSnapshot('asking-directions')
    expect(stillGone).toBeNull()
  })

  it('delete 后 get 返回 null', async () => {
    await scenarioPausedDB.savePausedSnapshot(baseSnap('travel-planning'))
    await scenarioPausedDB.deletePausedSnapshot('travel-planning')
    expect(await scenarioPausedDB.getPausedSnapshot('travel-planning')).toBeNull()
  })

  it('delete 不存在的 scenarioId 不抛错（幂等）', async () => {
    await expect(
      scenarioPausedDB.deletePausedSnapshot('does-not-exist'),
    ).resolves.toBeUndefined()
  })

  it('listAllPaused 仅返回未过期，过期的顺手清理', async () => {
    await scenarioPausedDB.savePausedSnapshot(baseSnap('a'))
    await scenarioPausedDB.savePausedSnapshot(baseSnap('b'))

    setNow(T0 + 2 * 60 * 60 * 1000) // 2h 后保存 c
    await scenarioPausedDB.savePausedSnapshot(baseSnap('c'))

    // 跳到 a/b 过期，但 c 还活（c 比 a/b 晚 2h 保存）
    setNow(T0 + SCENARIO_PAUSED_TTL_MS + 1)

    const alive = await scenarioPausedDB.listAllPaused()
    expect(alive.map((r) => r.scenarioId).sort()).toEqual(['c'])

    // 直接 get 已过期的 a/b 也都该被清掉
    expect(await scenarioPausedDB.getPausedSnapshot('a')).toBeNull()
    expect(await scenarioPausedDB.getPausedSnapshot('b')).toBeNull()
  })

  it('cleanupExpired 返回正确清理数量', async () => {
    await scenarioPausedDB.savePausedSnapshot(baseSnap('x'))
    await scenarioPausedDB.savePausedSnapshot(baseSnap('y'))

    setNow(T0 + 60 * 60 * 1000) // 1h 后再存 z
    await scenarioPausedDB.savePausedSnapshot(baseSnap('z'))

    // 跳到 x/y 过期、z 还活
    setNow(T0 + SCENARIO_PAUSED_TTL_MS + 1)
    expect(await scenarioPausedDB.cleanupExpired()).toBe(2)

    // 再清一次什么都没有了
    expect(await scenarioPausedDB.cleanupExpired()).toBe(0)

    // z 还活
    const z = await scenarioPausedDB.getPausedSnapshot('z')
    expect(z).not.toBeNull()
  })
})
