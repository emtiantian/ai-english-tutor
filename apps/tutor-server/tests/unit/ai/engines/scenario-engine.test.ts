import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ScenarioEngine } from '@/ai/engines/scenario-engine.js'
import * as vocabLoader from '@/vocab/loader.js'
import type { Scenario, VocabLevel } from '@/vocab/loader.js'
import { LUNA_PERSONA } from '@ai-english-tutor/shared'

function makeVocab(words: Array<{ word: string; topic: string }>): VocabLevel {
  return {
    level: 'MOCK',
    levelNum: 1,
    description: '',
    wordCount: words.length,
    words: words.map(w => ({ ...w, meaning: '', pos: 'noun' }))
  }
}

describe('ScenarioEngine', () => {
  let getVocabularyByLevelSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    getVocabularyByLevelSpy?.mockRestore()
  })

  it('createScenarioState 使用 levelProfile 的 maxTurns 和 targetWordCount', () => {
    const scenario: Scenario = {
      id: 'test-engine-scenario',
      name: '测试引擎场景',
      nameEn: 'Test Engine Scenario',
      description: '测试',
      icon: '🧪',
      level: 1,
      topics: ['food'],
      targetWords: ['coffee', 'tea'],
      role: { student: 'Customer', teacher: 'Waiter' },
      setting: 'A cafe.',
      objectives: [],
      levelProfiles: {
        B1: {
          setting: 'A busy burger joint.',
          maxTurns: 42,
          targetWordCount: 12,
          acts: [
            { name: '开场', goal: 'Greet', vocabThemes: ['greeting'] },
            { name: '主线', goal: 'Order', vocabThemes: ['food'] },
            { name: '收尾', goal: 'Pay', vocabThemes: ['payment'] }
          ]
        }
      }
    }

    getVocabularyByLevelSpy = vi
      .spyOn(vocabLoader, 'getVocabularyByLevel')
      .mockImplementation((level: string) => {
        if (level === 'B1') {
          return makeVocab(
            Array.from({ length: 50 }, (_, i) => ({
              word: `b1-word-${i + 1}`,
              topic: i < 20 ? 'greeting' : i < 40 ? 'food' : 'payment'
            }))
          )
        }
        return makeVocab([])
      })

    const engine = new ScenarioEngine({} as any, {} as any, {} as any, {} as any, LUNA_PERSONA)

    const state = (engine as any).createScenarioState(scenario, 'B1')

    expect(state.maxTurns).toBe(42)
    expect(state.targetWords.length).toBe(12)
    expect(state.levelProfile).toEqual(scenario.levelProfiles!.B1)
    expect(state.actThemes).toEqual([['greeting'], ['food'], ['payment']])
  })

  it('createScenarioState 在缺少 levelProfile 时回退到默认值', () => {
    const scenario: Scenario = {
      id: 'test-engine-scenario',
      name: '测试引擎场景',
      nameEn: 'Test Engine Scenario',
      description: '测试',
      icon: '🧪',
      level: 1,
      topics: ['food'],
      targetWords: ['coffee', 'tea'],
      role: { student: 'Customer', teacher: 'Waiter' },
      setting: 'A cafe.',
      objectives: []
    }

    getVocabularyByLevelSpy = vi
      .spyOn(vocabLoader, 'getVocabularyByLevel')
      .mockImplementation((level: string) => {
        if (level === 'A1') {
          return makeVocab(
            Array.from({ length: 40 }, (_, i) => ({
              word: `a1-word-${i + 1}`,
              topic: 'food'
            }))
          )
        }
        return makeVocab([])
      })

    const engine = new ScenarioEngine({} as any, {} as any, {} as any, {} as any, LUNA_PERSONA)

    const state = (engine as any).createScenarioState(scenario, 'A1')

    expect(state.maxTurns).toBe(20)
    expect(state.targetWords.length).toBe(30)
    expect(state.levelProfile).toBeUndefined()
  })
})
