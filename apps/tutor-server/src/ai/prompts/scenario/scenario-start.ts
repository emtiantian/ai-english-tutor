import type { CEFRLevel, Scenario } from '@ai-english-tutor/shared'
import type { LLMMessage } from '../../llm.js'
import { buildScenarioOpeningContext } from './context-builder.js'

export function buildScenarioStartMessages(
  scenario: Scenario,
  _level: number,
  targetLevel: CEFRLevel
): { messages: LLMMessage[] } {
  const systemPrompt = buildScenarioOpeningContext(scenario, targetLevel)

  return {
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content:
          `Open the "${scenario.nameEn}" scene naturally in JSON format. ` +
          `The situation is: ${scenario.setting} Begin directly as your assigned scene role.`
      }
    ]
  }
}
