import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { pickScenarioVocabulary } from '@/ai/scenario-vocab-picker.js'
import * as vocabLoader from '@/vocab/loader.js'
import type { Scenario, VocabLevel } from '@/vocab/loader.js'

const baseScenario: Scenario = {
  id: 'test-scenario',
  name: '测试场景',
  nameEn: 'Test Scenario',
  description: '用于测试抽词逻辑',
  icon: '🧪',
  level: 1,
  topics: ['food', 'politeness'],
  targetWords: ['coffee', 'tea', 'please'],
  role: { student: '顾客', teacher: '服务员' },
  setting: 'A test cafe.',
  objectives: []
}

function makeVocab(words: Array<{ word: string; topic: string }>): VocabLevel {
  return {
    level: 'MOCK',
    levelNum: 1,
    description: '',
    wordCount: words.length,
    words: words.map(w => ({ ...w, meaning: '', pos: 'noun' }))
  }
}

describe('pickScenarioVocabulary', () => {
  let getVocabularyByLevelSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    getVocabularyByLevelSpy?.mockRestore()
  })

  it('默认最多抽取 100 个场景相关词', () => {
    const scenario = vocabLoader.getScenarioById('restaurant-ordering')!
    const wordsA1 = pickScenarioVocabulary(scenario, 'A1')
    expect(wordsA1.length).toBeGreaterThan(0)
    expect(wordsA1.length).toBeLessThanOrEqual(100)
  })

  it('returns unique words', () => {
    const scenario = vocabLoader.getScenarioById('restaurant-ordering')!
    const wordsA1 = pickScenarioVocabulary(scenario, 'A1')
    const unique = new Set(wordsA1.map(w => w.toLowerCase()))
    expect(unique.size).toBe(wordsA1.length)
  })

  it('将 targetCount 作为上限', () => {
    const scenario = vocabLoader.getScenarioById('restaurant-ordering')!
    const words10 = pickScenarioVocabulary(scenario, 'A1', 10)
    expect(words10.length).toBeGreaterThan(0)
    expect(words10.length).toBeLessThanOrEqual(10)
  })

  it('C2 也只返回存在的相关词，不用无关词补满', () => {
    const scenario = vocabLoader.getScenarioById('restaurant-ordering')!
    const wordsC2 = pickScenarioVocabulary(scenario, 'C2')
    expect(wordsC2.length).toBeGreaterThan(0)
    expect(wordsC2.length).toBeLessThanOrEqual(100)
  })

  it('per-act vocabThemes 抽词结果符合幕主题', () => {
    const a1Words = [
      { word: 'hello', topic: 'greeting' },
      { word: 'hi', topic: 'greeting' },
      { word: 'please', topic: 'politeness' },
      { word: 'thanks', topic: 'politeness' },
      { word: 'sorry', topic: 'politeness' },
      { word: 'eat', topic: 'food' },
      { word: 'drink', topic: 'food' },
      { word: 'apple', topic: 'food' },
      { word: 'one', topic: 'number' },
      { word: 'two', topic: 'number' }
    ]

    getVocabularyByLevelSpy = vi
      .spyOn(vocabLoader, 'getVocabularyByLevel')
      .mockImplementation((level: string) => {
        if (level === 'A1') return makeVocab(a1Words)
        if (level === 'A2') return makeVocab([])
        return makeVocab([])
      })

    const scenario: Scenario = {
      ...baseScenario,
      levelProfiles: {
        A1: {
          acts: [
            { name: '开场', goal: 'Greet', vocabThemes: ['greeting', 'politeness'] },
            { name: '主线', goal: 'Order', vocabThemes: ['food'] },
            { name: '收尾', goal: 'Pay', vocabThemes: ['number'] }
          ]
        }
      }
    }

    const words = pickScenarioVocabulary(scenario, 'A1', 6)
    expect(words.length).toBe(6)

    const wordTopics = new Map<string, string>()
    for (const w of a1Words) wordTopics.set(w.word, w.topic)

    // 每幕分到 2 个词；结果里应至少出现每个幕主题下的词
    const themes = new Set(scenario.levelProfiles!.A1!.acts!.flatMap(a => a.vocabThemes ?? []))
    const coveredThemes = new Set<string>()
    for (const w of words) {
      const topic = wordTopics.get(w)
      if (topic && themes.has(topic)) coveredThemes.add(topic)
    }
    expect(coveredThemes.size).toBeGreaterThanOrEqual(2)
  })

  it('levelProfiles 存在时优先使用 profile 的 acts 与 vocabThemes', () => {
    const a1Words = [
      { word: 'hello', topic: 'greeting' },
      { word: 'please', topic: 'politeness' }
    ]

    getVocabularyByLevelSpy = vi
      .spyOn(vocabLoader, 'getVocabularyByLevel')
      .mockImplementation((level: string) => {
        if (level === 'A1') return makeVocab(a1Words)
        return makeVocab([])
      })

    const scenario: Scenario = {
      ...baseScenario,
      topics: ['food'],
      levelProfiles: {
        A1: {
          acts: [{ name: '开场', goal: 'Greet', vocabThemes: ['greeting', 'politeness'] }]
        }
      }
    }

    const words = pickScenarioVocabulary(scenario, 'A1', 2)
    expect(words.length).toBe(2)
    // 若使用全局 topics=['food']，则抽不到任何词（mock 中没有 food）；
    // 只有使用 profile 的 vocabThemes 才能拿到 hello/please。
    expect(words).toEqual(expect.arrayContaining(['hello', 'please']))
  })

  it('相关词不足时不使用其他主题的词补齐', () => {
    getVocabularyByLevelSpy = vi
      .spyOn(vocabLoader, 'getVocabularyByLevel')
      .mockImplementation((level: string) => {
        if (level === 'A1') {
          return makeVocab([
            { word: 'menu', topic: 'food' },
            { word: 'airport', topic: 'travel' }
          ])
        }
        return makeVocab([])
      })

    const words = pickScenarioVocabulary(baseScenario, 'A1', 100)
    expect(words).toEqual(['menu'])
    expect(words).not.toContain('airport')
  })

  it('可通过策略参数替换等级混合规则', () => {
    getVocabularyByLevelSpy = vi
      .spyOn(vocabLoader, 'getVocabularyByLevel')
      .mockImplementation((level: string) => {
        if (level === 'A1') return makeVocab([{ word: 'basic', topic: 'food' }])
        if (level === 'A2') return makeVocab([{ word: 'current', topic: 'food' }])
        if (level === 'B1') return makeVocab([{ word: 'advanced', topic: 'food' }])
        return makeVocab([])
      })

    const words = pickScenarioVocabulary(baseScenario, 'A2', 1, {
      targetPoolSize: 1,
      focusWordsPerTurn: 1,
      maxAnnotatedWordsPerReply: 1,
      levelMix: { primary: 0, review: 0, challenge: 1 }
    })
    expect(words).toEqual(['advanced'])
  })

  it('返回的目标词按幕顺序分组', () => {
    const a1Words = [
      { word: 'hello', topic: 'greeting' },
      { word: 'please', topic: 'politeness' },
      { word: 'eat', topic: 'food' },
      { word: 'drink', topic: 'food' },
      { word: 'one', topic: 'number' },
      { word: 'two', topic: 'number' }
    ]

    getVocabularyByLevelSpy = vi
      .spyOn(vocabLoader, 'getVocabularyByLevel')
      .mockImplementation((level: string) => {
        if (level === 'A1') return makeVocab(a1Words)
        return makeVocab([])
      })

    const scenario: Scenario = {
      ...baseScenario,
      levelProfiles: {
        A1: {
          acts: [
            { name: '开场', goal: 'Greet', vocabThemes: ['greeting', 'politeness'] },
            { name: '主线', goal: 'Order', vocabThemes: ['food'] },
            { name: '收尾', goal: 'Pay', vocabThemes: ['number'] }
          ]
        }
      }
    }

    // 固定随机种子，让幕内顺序可预测
    const mathRandom = Math.random
    let seed = 12345
    Math.random = () => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    }

    try {
      const words = pickScenarioVocabulary(scenario, 'A1', 6)
      expect(words.length).toBe(6)

      // 每幕 2 个词，按幕顺序：前两词来自开场主题，中间两词来自 food，后两词来自 number
      const act0Words = new Set(['hello', 'please'])
      const act1Words = new Set(['eat', 'drink'])
      const act2Words = new Set(['one', 'two'])

      expect(act0Words.has(words[0])).toBe(true)
      expect(act0Words.has(words[1])).toBe(true)
      expect(act1Words.has(words[2])).toBe(true)
      expect(act1Words.has(words[3])).toBe(true)
      expect(act2Words.has(words[4])).toBe(true)
      expect(act2Words.has(words[5])).toBe(true)
    } finally {
      Math.random = mathRandom
    }
  })
})
