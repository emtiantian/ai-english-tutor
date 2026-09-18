import { describe, expect, it } from 'vitest'
import { scenarios } from '@ai-english-tutor/shared'
import { buildScenarioStartMessages } from '@/ai/prompts/scenario/scenario-start.js'
import { buildScenarioTeachingMessages } from '@/ai/prompts/scenario/scenario-turn.js'
import { buildScenarioContext } from '@/ai/prompts/scenario/context-builder.js'

const restaurant = scenarios.find(scenario => scenario.id === 'restaurant-ordering')!
const askingDirections = scenarios.find(scenario => scenario.id === 'asking-directions')!
describe('scenario teaching prompts', () => {
  it('keeps the directions scene generic instead of binding it to a fixed destination', () => {
    const { messages } = buildScenarioStartMessages(askingDirections, 4, 'B2')
    const system = String(messages[0].content)

    expect(system).toContain('unfamiliar city')
    expect(system).toContain('find a place and ask a local for directions')
    expect(system).not.toContain('train station')
    expect(system).not.toContain('school')
    expect(system).not.toContain('hospital')
    expect(system).toContain('English difficulty: B2')
  })

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

  it('uses the scene definition independently from the CEFR difficulty', () => {
    const context = buildScenarioContext(restaurant, 'B1')

    expect(context).toContain(`Setting: ${restaurant.setting}`)
    expect(context).toContain('English difficulty: B1')
    expect(context).toContain('- Greet the waiter')
    expect(context).not.toContain('Opening:')
    expect(context).not.toContain('Body:')
  })
})
