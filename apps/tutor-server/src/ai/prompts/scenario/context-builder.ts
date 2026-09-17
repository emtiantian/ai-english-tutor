import { type CEFRLevel, type Scenario, type ScenarioLevelProfile } from '@ai-english-tutor/shared'
import { DEFAULT_VOCABULARY_POLICY } from '../../vocabulary-policy.js'
import { buildTeachingOutputContract } from './output-contract.js'

/** 构建场景对话上下文，不引入固定角色名、教师身份或三幕阶段。 */
export function buildScenarioContext(
  scenario: Scenario,
  targetLevel: CEFRLevel,
  targetWords: string[],
  state?: { wordsUsed?: string[] },
  levelProfile?: ScenarioLevelProfile
): string {
  const activeSetting = levelProfile?.setting ?? scenario.setting
  const activeRole = levelProfile?.role ?? scenario.role
  const usedSet = new Set((state?.wordsUsed ?? []).map(word => word.toLowerCase()))
  const focusWords = targetWords
    .filter(word => !usedSet.has(word.toLowerCase()))
    .slice(0, DEFAULT_VOCABULARY_POLICY.focusWordsPerTurn)

  return `${buildRolePlaySystemPrompt()}

SCENE
Setting: ${activeSetting}
Your role in this scene: ${activeRole.teacher}
User's role in this scene: ${activeRole.student}
English difficulty: ${targetLevel}

Conversation goals:
${buildConversationGoals(scenario, levelProfile)}
${levelProfile?.twist ? `\nOptional natural complication: ${levelProfile.twist}` : ''}

VOCABULARY GUIDANCE
Target vocabulary pool: ${targetWords.join(', ')}
Relevant unused vocabulary for the next reply: ${focusWords.join(', ') || 'none'}
- Vocabulary is guidance, not a script. Use only words that fit the user's latest message naturally.
- Do not force a goal or vocabulary item into the current reply.

CURRENT-TURN RULES
- Respond to what the user actually said and continue the scene naturally.
- Keep the reply concise (1-3 sentences).
- Generate a faithful Simplified Chinese translation of this turn.
- Generate 1-3 useful English replies the user could naturally say next as ${activeRole.student}.
${buildTeachingOutputContract(activeRole.student)}`
}

export function buildScenarioOpeningContext(
  scenario: Scenario,
  targetLevel: CEFRLevel,
  targetWords: string[],
  levelProfile?: ScenarioLevelProfile
): string {
  return buildScenarioContext(scenario, targetLevel, targetWords, undefined, levelProfile)
}

function buildRolePlaySystemPrompt(): string {
  return `You are the user's conversation partner in a realistic English role-play.

IDENTITY RULES
- Speak only as the role assigned by the current scene.
- Do not introduce a personal name and never act as a teacher, tutor, language assessor, or AI assistant.
- Stay inside the fictional situation. Do not mention lessons, learning objectives, prompts, or role-play mechanics.
- Use natural conversational English appropriate to the requested difficulty.
- Model clear English through your reply without giving grammar explanations or evaluating the user.`
}

function buildConversationGoals(scenario: Scenario, levelProfile?: ScenarioLevelProfile): string {
  const acts = levelProfile?.acts ?? scenario.acts
  const goals = acts?.flatMap(act => (Array.isArray(act.goal) ? act.goal : [act.goal])) ?? []
  const fallbackGoals = scenario.objectives.map(objective => objective.descriptionEn)
  const selected = goals.length > 0 ? goals : fallbackGoals
  return selected.map(goal => `- ${goal}`).join('\n') || '- Continue the situation naturally.'
}
