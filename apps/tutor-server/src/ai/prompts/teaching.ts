import type { LLMMessage } from '../llm.js'
import {
  LUNA_PERSONA,
  type CharacterPersona,
  type OpeningStyle,
  type Scenario,
  type CEFRLevel,
} from '@ai-english-tutor/shared'
import type { ReviewWord } from '../vocab-tracker.js'

// Re-export for consumers that import from this module
export type { OpeningStyle }

/**
 * Pick a random opening style from the persona's preset list
 */
export function pickOpeningStyle(persona: CharacterPersona = LUNA_PERSONA): OpeningStyle {
  const styles = persona.styles
  return styles.find((s) => s.name === 'lazy-mature') ?? styles[0]
}

/**
 * Build messages for a teaching conversation.
 *
 * @param reviewWords - Words due for review (injected into system prompt)
 */
export function buildTeachingMessages(
  userMessage: string,
  level: number,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  style?: OpeningStyle,
  persona: CharacterPersona = LUNA_PERSONA,
  reviewWords?: ReviewWord[],
): LLMMessage[] {
  const personality = style?.persona
  let systemPrompt = persona.buildSystemPrompt(level, personality)

  // Inject vocabulary review instructions if there are words to review
  if (reviewWords && reviewWords.length > 0) {
    const wordList = reviewWords.map((w) => `"${w.word}"`).join(', ')
    systemPrompt += `

VOCABULARY REVIEW — The student needs to practice these words. Naturally incorporate them into your response in a NEW context (different from previous conversations). Don't force them — weave them in organically. If the word doesn't fit naturally, skip it.

Words to review: ${wordList}

After using a review word, include it in the "vocabulary" field of your JSON response. Include one example sentence per review word in "vocabularySentences"; each sentence must naturally include at least one of the review words above.`
  }

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
  ]

  // Add conversation history (last 10 messages to stay within context limit)
  for (const h of history.slice(-10)) {
    messages.push({ role: h.role, content: h.content })
  }

  // Add current user message
  messages.push({ role: 'user', content: userMessage })

  return messages
}

/**
 * Build messages for lesson start.
 *
 * Uses the provided style (or picks a random one from the persona)
 * and injects the personality into the system prompt.
 */
export function buildLessonStartMessages(
  level: number,
  style?: OpeningStyle,
  persona: CharacterPersona = LUNA_PERSONA,
): { messages: LLMMessage[]; style: OpeningStyle } {
  const chosen = style ?? pickOpeningStyle(persona)

  const messages: LLMMessage[] = [
    { role: 'system', content: persona.buildSystemPrompt(level, chosen.persona) },
    {
      role: 'user',
      content:
        `The student has just started a Level ${level} lesson. ` +
        `${chosen.persona} ` +
        `Give a warm welcome (1-2 sentences) that matches this personality. ` +
        `Then briefly introduce what we'll learn today.`,
    },
  ]

  return { messages, style: chosen }
}

/**
 * Build messages for starting a scenario-based lesson.
 *
 * Injects scenario context, role-play setup, and objectives into the prompt.
 */
export function buildScenarioStartMessages(
  scenario: Scenario,
  level: number,
  targetLevel: CEFRLevel,
  style?: OpeningStyle,
  persona: CharacterPersona = LUNA_PERSONA,
  reusableLines?: string[],
): { messages: LLMMessage[]; style: OpeningStyle } {
  const chosen = style ?? pickOpeningStyle(persona)
  // Strip base OUTPUT FORMAT — scenario context provides its own
  let systemPrompt = stripBaseOutputFormat(persona.buildSystemPrompt(level, chosen.persona))

  // Inject scenario context (includes its own OUTPUT FORMAT)
  systemPrompt += buildScenarioContext(scenario, targetLevel)
  systemPrompt += buildLineReuseBlock(reusableLines)

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content:
        `The student is starting a role-play scenario: "${scenario.nameEn}" at CEFR level ${targetLevel}. ` +
        `Setting: ${scenario.setting} ` +
        `Begin the scenario naturally. Introduce the setting and your role in character. ` +
        `Do NOT explain the objectives — just start the conversation as if it's really happening.`,
    },
  ]

  return { messages, style: chosen }
}

/**
 * Build messages for an ongoing scenario conversation.
 *
 * Includes scenario context, current objectives, and review words.
 */
export function buildScenarioTeachingMessages(
  userMessage: string,
  scenario: Scenario,
  level: number,
  targetLevel: CEFRLevel,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  style?: OpeningStyle,
  persona: CharacterPersona = LUNA_PERSONA,
  reviewWords?: ReviewWord[],
  reusableLines?: string[],
): LLMMessage[] {
  const personality = style?.persona
  // Strip base OUTPUT FORMAT — scenario context provides its own
  let systemPrompt = stripBaseOutputFormat(persona.buildSystemPrompt(level, personality))

  // Inject scenario context (includes its own OUTPUT FORMAT)
  systemPrompt += buildScenarioContext(scenario, targetLevel)
  systemPrompt += buildLineReuseBlock(reusableLines)

  // Inject vocabulary review instructions if there are words to review
  if (reviewWords && reviewWords.length > 0) {
    const wordList = reviewWords.map((w) => `"${w.word}"`).join(', ')
    systemPrompt += `

VOCABULARY REVIEW — Also try to naturally use these words if they fit the scenario:
Words: ${wordList}
Include any words you use in the "vocabulary" field and provide one example sentence per word in "vocabularySentences"; each sentence must naturally include at least one word from the vocabulary list above.`
  }

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
  ]

  // Add conversation history (last 10 messages)
  for (const h of history.slice(-10)) {
    messages.push({ role: h.role, content: h.content })
  }

  // Add current user message
  messages.push({ role: 'user', content: userMessage })

  return messages
}

/**
 * Strip the base persona's OUTPUT FORMAT section so the scenario's
 * OUTPUT FORMAT is the only one.
 */
function stripBaseOutputFormat(prompt: string): string {
  // Remove everything from "OUTPUT FORMAT" to the end of the prompt
  return prompt.replace(/\nOUTPUT FORMAT[\s\S]*$/, '')
}

/**
 * Build the reusable-line block injected after the scenario context.
 *
 * These are lines Luna has already spoken in this exact scenario + level + voice.
 * Reusing one VERBATIM guarantees a TTS cache hit (zero synthesis cost), so we
 * ask the model to prefer them when one fits — but only the "text" field, and
 * only when natural, so the conversation never feels canned. Returns '' when
 * there are no lines yet (cold start), so savings grow as the scenario is replayed.
 */
function buildLineReuseBlock(reusableLines?: string[]): string {
  if (!reusableLines || reusableLines.length === 0) return ''
  const list = reusableLines.map((l) => `- ${JSON.stringify(l)}`).join('\n')
  return `

LINE REUSE (say it the same way when it fits) — Below are lines you have ALREADY spoken in this exact scenario and CEFR level. If one of them fits the current moment naturally and in character, reuse it VERBATIM as your "text" — character-for-character identical, including punctuation. Only write a brand-new "text" when none of these fits the situation. This keeps your voice consistent. This applies ONLY to the "text" field; "textZh", "vocabularySentences" and "studentReplyHints" must still follow their own rules.

Previously spoken lines:
${list}`
}

/**
 * Build the scenario context block to inject into the system prompt.
 */
function buildScenarioContext(scenario: Scenario, targetLevel: CEFRLevel): string {
  // v2: use 3-act structure if available; otherwise fall back to objectives
  const actsBlock = scenario.acts
    ? buildActsBlock(scenario.acts)
    : buildObjectivesBlock(scenario.objectives)

  return `

SCENARIO CONTEXT — You are now in a role-play scenario.

Setting: ${scenario.setting}
Your role: ${scenario.role.teacher}
Student's role: ${scenario.role.student}
Target CEFR level: ${targetLevel}

TARGET VOCABULARY (use these words naturally in the conversation):
${scenario.targetWords.join(', ')}

${actsBlock}

SCENARIO RULES:
- Stay in character as ${scenario.role.teacher} throughout
- Guide the student through the act structure in order
- Use the target vocabulary naturally in your responses
- When the student uses target vocabulary, acknowledge it positively and naturally move forward
- Keep responses concise (1-3 sentences)
- In the Main act, introduce organic twists or complications to make the conversation feel real (do NOT rely on pre-written twists)
- When the student has used enough target words or the conversation has gone on long enough, move toward the Closing act and wrap up naturally

OUTPUT FORMAT:
{
  "text": "your response in character",
  "textZh": "简短的中文翻译，帮助学生理解",
  "motionId": "one of: wave|nod|think|gesture|clap|point|write|surprised — pick the gesture that best fits your text",
  "expressionId": "one of: happy|neutral|curious|surprised|encouraging|thoughtful — pick the facial expression that best fits your text",
  "vocabulary": ["target words you used from the TARGET VOCABULARY list above — only include words from that list"],
  "vocabularySentences": ["TEACHING examples — one fresh natural example sentence per vocabulary word, never reuse a sentence from earlier turns; each sentence must include at least one word from the vocabulary list above. Use [] only if vocabulary is also empty."],
  "studentReplyHints": ["1-3 short replies the STUDENT (playing ${scenario.role.student}) could naturally say NEXT in response to your text — written IN CHARACTER, in the student's own voice. Prefer replies that fit the current scenario phase and naturally use a target word when it suits the moment. NEVER write meta/teaching sentences like 'You can say X when Y' or 'This is how to use X' — these are real in-character lines the student would speak. Always provide at least one hint."]
}`
}

function buildActsBlock(acts: NonNullable<Scenario['acts']>): string {
  if (!acts || acts.length === 0) return ''
  const lines = acts.map((act, i) => {
    const labels = ['Opening', 'Main', 'Closing']
    return `${labels[i] ?? `Act ${i + 1}`}: ${act.name} — ${act.goal}`
  })
  return `3-ACT STRUCTURE (guide the conversation through these stages in order):\n${lines.map((l) => `- ${l}`).join('\n')}`
}

function buildObjectivesBlock(
  objectives: Scenario['objectives'],
): string {
  const objectivesText = objectives
    .map((obj, i) => `${i + 1}. ${obj.descriptionEn} — keywords: [${obj.keywords.join(', ')}]`)
    .join('\n')
  return `CONVERSATION PHASES (guide the student through these in order):\n${objectivesText}`
}
