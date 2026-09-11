import { describe, expect, it } from 'vitest'
import { isScenarioComplete } from '@/ai/utils/scenario-progress.js'

describe('scenario progress', () => {
  it('uses the configured maxTurns instead of the global default', () => {
    expect(isScenarioComplete(7, 0.2, 8)).toBe(false)
    expect(isScenarioComplete(8, 0.2, 8)).toBe(true)
  })
})
