import { describe, it, expect } from 'vitest'
import { scenarios, LUNA_PERSONA } from '@ai-english-tutor/shared'
import { buildScenarioStartMessages } from '@/ai/prompts/scenario/scenario-start.js'
import { buildScenarioTeachingMessages } from '@/ai/prompts/scenario/scenario-turn.js'
import { buildScenarioContext } from '@/ai/prompts/scenario/context-builder.js'

const restaurant = scenarios.find(s => s.id === 'restaurant-ordering')!
const runtimeWords = Array.from({ length: 30 }, (_, i) => `word${i + 1}`)

describe('scenario teaching prompts', () => {
  it('start messages inject runtime target words', () => {
    const { messages: startMessages } = buildScenarioStartMessages(
      restaurant,
      1,
      'A1',
      undefined,
      LUNA_PERSONA,
      undefined,
      runtimeWords
    )
    const startSystem = String(startMessages[0].content)

    expect(startSystem).toContain('Target vocabulary pool')
    for (const w of runtimeWords) {
      expect(startSystem).toContain(w)
    }
    expect(startSystem).toContain('Setting:')
    expect(startSystem).toContain('Your role:')
    expect(startSystem).toContain('Target CEFR level: A1')
    expect(startSystem).toContain('OUTPUT FORMAT')
    expect(startSystem).not.toContain('Current act:')
    expect(startSystem).not.toContain('Focus words for this turn')
    expect(startSystem).not.toContain('Three-act structure')
  })

  it('teaching messages focus on unused words in current act', () => {
    const usedWords = ['word1', 'word2', 'word3']
    const teachingMessages = buildScenarioTeachingMessages(
      'I would like to order something.',
      restaurant,
      1,
      'A1',
      [],
      undefined,
      LUNA_PERSONA,
      undefined,
      undefined,
      runtimeWords,
      { currentActIndex: 0, wordsUsed: usedWords }
    )
    const teachingSystem = String(teachingMessages[0].content)

    expect(teachingSystem).toContain('Target vocabulary pool')
    for (const w of usedWords) {
      expect(teachingSystem).toContain(`- ${w}`)
    }

    const bucketSize = Math.ceil(runtimeWords.length / 3)
    const firstBucket = runtimeWords.slice(0, bucketSize)
    const firstBucketUnused = firstBucket.filter(w => !usedWords.includes(w))
    for (const w of firstBucketUnused.slice(0, 5)) {
      expect(teachingSystem).toContain(`- ${w}`)
    }

    expect(teachingSystem).toContain('studentReplyHints must be')
  })

  it('buildScenarioContext 正确注入 twist 和 vocabThemes', () => {
    const levelProfile = {
      setting: 'A busy burger joint at lunchtime.',
      twist: 'You need to ask whether a dish contains nuts or dairy.',
      acts: [
        {
          name: '开场',
          goal: 'Greet and ask about allergens.',
          vocabThemes: ['greeting', 'health']
        },
        { name: '主线', goal: 'Choose a safe meal.', vocabThemes: ['food', 'preference'] },
        {
          name: '收尾',
          goal: 'Pay and give brief feedback.',
          vocabThemes: ['payment', 'evaluation']
        }
      ]
    }

    const ctx = buildScenarioContext(
      restaurant,
      'B1',
      runtimeWords,
      { currentActIndex: 1 },
      levelProfile
    )

    expect(ctx).toContain(
      'Natural complication for this level: You need to ask whether a dish contains nuts or dairy.'
    )
    expect(ctx).toContain('Current act theme: food, preference')
    expect(ctx).toContain('A busy burger joint at lunchtime.')
  })
})
