import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestEnv } from '@tests/helpers/env.js'

describe('line-pool', () => {
  const env = createTestEnv('line-pool')

  beforeAll(() => {
    env.setup({ LINE_POOL_MAX_LINES: '3' })
  })

  afterAll(() => {
    env.cleanup()
  })

  it('starts empty on cold start', async () => {
    const { lineGroupKey, getReusableLines } = await import('@/ai/line-pool.js')
    const group = lineGroupKey('restaurant-ordering', 'A1', 'voiceA')
    expect(await getReusableLines(group)).toEqual([])
  })

  it('returns recorded lines', async () => {
    const { lineGroupKey, recordTeacherLine, getReusableLines } = await import('@/ai/line-pool.js')
    const group = lineGroupKey('restaurant-ordering', 'A1', 'voiceA')
    await recordTeacherLine(group, 'Good evening! Welcome.')
    expect(await getReusableLines(group)).toEqual(['Good evening! Welcome.'])
  })

  it('deduplicates normalized text', async () => {
    const { lineGroupKey, recordTeacherLine, getReusableLines } = await import('@/ai/line-pool.js')
    const group = lineGroupKey('restaurant-ordering', 'A1', 'voiceA')
    await recordTeacherLine(group, '  good   evening! welcome.  ')
    const afterDedup = await getReusableLines(group)
    expect(afterDedup.length).toBe(1)
    expect(afterDedup[0]).toBe('Good evening! Welcome.')
  })

  it('ranks lines by frequency', async () => {
    const { lineGroupKey, recordTeacherLine, getReusableLines } = await import('@/ai/line-pool.js')
    const group = lineGroupKey('restaurant-ordering', 'A1', 'voiceA')
    await recordTeacherLine(group, 'What would you like to drink?')
    await recordTeacherLine(group, 'What would you like to drink?')
    await recordTeacherLine(group, 'What would you like to drink?')
    const ranked = await getReusableLines(group)
    expect(ranked[0]).toBe('What would you like to drink?')
  })

  it('caps pool at MAX_LINES and keeps highest-frequency line', async () => {
    const { lineGroupKey, recordTeacherLine, getReusableLines } = await import('@/ai/line-pool.js')
    const group = lineGroupKey('restaurant-ordering', 'A1', 'voiceA')
    await recordTeacherLine(group, 'What would you like to drink?')
    await recordTeacherLine(group, 'What would you like to drink?')
    await recordTeacherLine(group, 'What would you like to drink?')
    await recordTeacherLine(group, 'Here is your table.')
    await recordTeacherLine(group, 'Anything else?')
    const capped = await getReusableLines(group, 100)
    expect(capped.length).toBeLessThanOrEqual(3)
    expect(capped).toContain('What would you like to drink?')
  })

  it('isolates pools by voice', async () => {
    const { lineGroupKey, getReusableLines } = await import('@/ai/line-pool.js')
    const otherVoice = lineGroupKey('restaurant-ordering', 'A1', 'voiceB')
    expect(await getReusableLines(otherVoice)).toEqual([])
  })

  it('ignores empty or whitespace-only text', async () => {
    const { lineGroupKey, recordTeacherLine } = await import('@/ai/line-pool.js')
    const group = lineGroupKey('restaurant-ordering', 'A1', 'voiceA')
    await expect(recordTeacherLine(group, '   ')).resolves.toBeUndefined()
  })
})
