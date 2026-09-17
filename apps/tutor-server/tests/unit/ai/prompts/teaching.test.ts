import { describe, expect, it } from 'vitest'
import { scenarios } from '@ai-english-tutor/shared'
import { buildScenarioStartMessages } from '@/ai/prompts/scenario/scenario-start.js'
import { buildScenarioTeachingMessages } from '@/ai/prompts/scenario/scenario-turn.js'
import { buildScenarioContext } from '@/ai/prompts/scenario/context-builder.js'

const restaurant = scenarios.find(scenario => scenario.id === 'restaurant-ordering')!
const runtimeWords = Array.from({ length: 60 }, (_, index) => `word${index + 1}`)

describe('scenario teaching prompts', () => {
  it('uses only the assigned scene role without a named tutor persona or act progression', () => {
    const { messages } = buildScenarioStartMessages(restaurant, 4, 'B2', runtimeWords)
    const system = String(messages[0].content)

    expect(system).toContain('Your role in this scene:')
    expect(system).toContain("User's role in this scene:")
    expect(system).toContain('English difficulty: B2')
    expect(system).toContain('Conversation goals:')
    expect(system).toContain('RESPONSE CONTRACT — HIGHEST PRIORITY')
    expect(system).not.toContain('Luna')
    expect(system).not.toContain('Three-act structure')
    expect(system).not.toContain('Current act:')
    expect(system).not.toContain('TEACHING LEVEL')
  })

  it('treats unused vocabulary as optional guidance instead of an act bucket', () => {
    const messages = buildScenarioTeachingMessages(
      'I would like to order something.',
      restaurant,
      4,
      'B2',
      [],
      runtimeWords,
      { wordsUsed: ['word1', 'word2'] }
    )
    const system = String(messages[0].content)

    expect(system).toContain('Relevant unused vocabulary for the next reply: word3')
    expect(system).toContain('Vocabulary is guidance, not a script.')
    expect(system).toContain('Do not force a goal or vocabulary item')
    expect(system).not.toContain('Current act:')
    expect(system).not.toContain('Coming up')
    expect(system.match(/RESPONSE CONTRACT — HIGHEST PRIORITY/g)).toHaveLength(1)
  })

  it('keeps level-specific setting, goals and optional complication without act labels', () => {
    const context = buildScenarioContext(restaurant, 'B1', runtimeWords, undefined, {
      setting: 'A busy burger joint at lunchtime.',
      twist: 'A dish may contain nuts or dairy.',
      acts: [
        { name: '开场', goal: 'Ask about allergens.' },
        { name: '主线', goal: 'Choose a safe meal.' }
      ]
    })

    expect(context).toContain('A busy burger joint at lunchtime.')
    expect(context).toContain('- Ask about allergens.')
    expect(context).toContain('- Choose a safe meal.')
    expect(context).toContain('Optional natural complication: A dish may contain nuts or dairy.')
    expect(context).not.toContain('Opening:')
    expect(context).not.toContain('Body:')
  })
})
