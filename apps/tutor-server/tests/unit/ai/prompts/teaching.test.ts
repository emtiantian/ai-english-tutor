import { describe, expect, it } from 'vitest'
import { scenarios } from '@ai-english-tutor/shared'
import { buildScenarioStartMessages } from '@/ai/prompts/scenario/scenario-start.js'
import { buildScenarioTeachingMessages } from '@/ai/prompts/scenario/scenario-turn.js'
import { buildScenarioContext } from '@/ai/prompts/scenario/context-builder.js'

const restaurant = scenarios.find(scenario => scenario.id === 'restaurant-ordering')!
describe('scenario teaching prompts', () => {
  it('uses only the assigned scene role without a named tutor persona or act progression', () => {
    const { messages } = buildScenarioStartMessages(restaurant, 4, 'B2')
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

  it('asks the model to annotate useful vocabulary after writing a natural reply', () => {
    const messages = buildScenarioTeachingMessages(
      'I would like to order something.',
      restaurant,
      4,
      'B2',
      []
    )
    const system = String(messages[0].content)

    expect(system).toContain('Write the scene reply naturally first')
    expect(system).toContain('challenge this B2 learner')
    expect(system).toContain('roughly one CEFR step above it')
    expect(system).not.toContain('Target vocabulary pool')
    expect(system).not.toContain('Current act:')
    expect(system).not.toContain('Coming up')
    expect(system.match(/RESPONSE CONTRACT — HIGHEST PRIORITY/g)).toHaveLength(1)
  })

  it('keeps level-specific setting, goals and optional complication without act labels', () => {
    const context = buildScenarioContext(restaurant, 'B1', {
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
