import type { LLMMessage } from '../llm.js'
import {
  LUNA_PERSONA,
  type CharacterPersona,
  type OpeningStyle,
  type Scenario,
  type CEFRLevel,
} from '@ai-english-tutor/shared'
import type { ReviewWord } from '../vocab-tracker.js'

// 为从本模块导入的调用方重新导出
export type { OpeningStyle }

/**
 * 从角色预设列表中随机挑选一个开场风格
 */
export function pickOpeningStyle(persona: CharacterPersona = LUNA_PERSONA): OpeningStyle {
  const styles = persona.styles
  return styles.find((s) => s.name === 'lazy-mature') ?? styles[0]
}

/**
 * 为教学对话构建消息。
 *
 * @param reviewWords - 待复习的单词（注入到 system prompt 中）
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

  // 如果有待复习单词，注入复习指令
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

  // 添加对话历史（取最近 10 条以控制上下文长度）
  for (const h of history.slice(-10)) {
    messages.push({ role: h.role, content: h.content })
  }

  // 添加当前用户消息
  messages.push({ role: 'user', content: userMessage })

  return messages
}

/**
 * 为课程开始构建消息。
 *
 * 使用传入的风格（或从角色中随机挑选一个）并将人格注入 system prompt。
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
 * 为启动场景化课程构建消息。
 *
 * 向 prompt 注入场景上下文、角色扮演设定和目标。
 */
export function buildScenarioStartMessages(
  scenario: Scenario,
  level: number,
  targetLevel: CEFRLevel,
  style?: OpeningStyle,
  persona: CharacterPersona = LUNA_PERSONA,
  reusableLines?: string[],
  targetWords?: string[],
): { messages: LLMMessage[]; style: OpeningStyle } {
  const chosen = style ?? pickOpeningStyle(persona)
  // 剥离基础 OUTPUT FORMAT —— 场景上下文会提供自己的格式
  let systemPrompt = stripBaseOutputFormat(persona.buildSystemPrompt(level, chosen.persona))

  // v2：优先使用运行时目标词；没有则回退到静态 scenario.targetWords
  const words = targetWords && targetWords.length > 0 ? targetWords : scenario.targetWords
  // 注入场景上下文（包含它自己的 OUTPUT FORMAT）
  systemPrompt += buildScenarioContext(scenario, targetLevel, words, { currentActIndex: 0 })
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
 * 为进行中的场景对话构建消息。
 *
 * 包含场景上下文、当前目标和复习单词。
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
  targetWords?: string[],
  vocabState?: {
    currentActIndex?: number
    wordsUsed?: string[]
  },
): LLMMessage[] {
  const personality = style?.persona
  // 剥离基础 OUTPUT FORMAT —— 场景上下文会提供自己的格式
  let systemPrompt = stripBaseOutputFormat(persona.buildSystemPrompt(level, personality))

  // v2：优先使用运行时目标词，回退到静态 scenario.targetWords
  const words = targetWords && targetWords.length > 0 ? targetWords : scenario.targetWords
  // 注入场景上下文（包含它自己的 OUTPUT FORMAT）
  systemPrompt += buildScenarioContext(scenario, targetLevel, words, vocabState)
  systemPrompt += buildLineReuseBlock(reusableLines)

  // 如果有待复习单词，注入复习指令
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

  // 添加对话历史（最近 10 条）
  for (const h of history.slice(-10)) {
    messages.push({ role: h.role, content: h.content })
  }

  // 添加当前用户消息
  messages.push({ role: 'user', content: userMessage })

  return messages
}

/**
 * 剥离基础角色人设的 OUTPUT FORMAT 段落，使场景自己的
 * OUTPUT FORMAT 成为唯一格式。
 */
function stripBaseOutputFormat(prompt: string): string {
  // 移除从 "OUTPUT FORMAT" 到 prompt 末尾的所有内容
  return prompt.replace(/\nOUTPUT FORMAT[\s\S]*$/, '')
}

/**
 * 构建注入场景上下文之后的可复用台词块。
 *
 * 这些台词是 Luna 在当前这个场景 + 等级 + 音色下已经说过的。
 * 逐字复用其中一句可保证命中 TTS 缓存（零合成成本），因此我们会
 * 让模型在合适时优先使用——但仅用于 "text" 字段，且只在自然时复用，
 * 避免对话显得生硬。没有可用台词时返回 ''（冷启动），随着场景反复进行，
 * 节省的成本会越来越高。
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
 * 构建要注入 system prompt 的场景上下文块。
 */
function buildScenarioContext(
  scenario: Scenario,
  targetLevel: CEFRLevel,
  targetWords: string[],
  state?: {
    currentActIndex?: number
    wordsUsed?: string[]
  },
): string {
  // v2：将目标词汇分到各幕，让 LLM 每轮只关注一小批词
  const actsCount = scenario.acts?.length ?? 3
  const buckets = bucketWordsForActs(targetWords, actsCount)
  const currentActIndex = Math.min(
    buckets.length - 1,
    Math.max(0, state?.currentActIndex ?? 0),
  )
  const currentBucket = buckets[currentActIndex]

  const usedSet = new Set((state?.wordsUsed ?? []).map((w) => w.toLowerCase()))
  const usedTargetWords = targetWords.filter((w) => usedSet.has(w.toLowerCase()))
  const unusedTargetWords = targetWords.filter((w) => !usedSet.has(w.toLowerCase()))

  const focusWords = currentBucket.words.filter(
    (w) => !usedSet.has(w.toLowerCase()),
  )
  // 如果当前幕即将完成，也开始露出下一幕的词汇
  const currentBucketUsedCount = currentBucket.words.filter((w) =>
    usedSet.has(w.toLowerCase()),
  ).length
  const currentBucketProgress =
    currentBucket.words.length > 0
      ? currentBucketUsedCount / currentBucket.words.length
      : 0

  let nextBucketWords: string[] = []
  if (currentBucketProgress >= 0.5 && currentActIndex < buckets.length - 1) {
    nextBucketWords = buckets[currentActIndex + 1].words.filter(
      (w) => !usedSet.has(w.toLowerCase()),
    )
  }

  // v2：有 3 幕结构时优先使用；否则回退到 objectives
  const actsBlock = scenario.acts
    ? buildActsBlock(scenario.acts)
    : buildObjectivesBlock(scenario.objectives)

  const focusList = focusWords.slice(0, 5)
  const nextList = nextBucketWords.slice(0, 3)

  const focusSection = focusList.length
    ? `FOCUS WORDS FOR THIS TURN (naturally use or model these UNUSED words, in priority order):\n${focusList.map((w) => `- ${w}`).join('\n')}`
    : `FOCUS WORDS FOR THIS TURN: none left in this act — move the conversation forward toward the next act.`

  const nextSection = nextList.length
    ? `COMING UP NEXT (you may lightly preview one of these if the current act is wrapping up):\n${nextList.map((w) => `- ${w}`).join('\n')}`
    : ''

  const usedSection = usedTargetWords.length
    ? `ALREADY USED BY STUDENT (acknowledge positively, do not force reuse):\n${usedTargetWords.map((w) => `- ${w}`).join('\n')}`
    : 'No target words used by the student yet.'

  return `

SCENARIO CONTEXT — You are now in a role-play scenario.

Setting: ${scenario.setting}
Your role: ${scenario.role.teacher}
Student's role: ${scenario.role.student}
Target CEFR level: ${targetLevel}

${actsBlock}

TARGET VOCABULARY POOL (${targetWords.length} words to weave naturally across the whole scenario):
${targetWords.join(', ')}

CURRENT ACT: ${currentActIndex + 1} of ${buckets.length}
${focusSection}
${nextSection}
${usedSection}

SCENARIO RULES:
- Stay in character as ${scenario.role.teacher} throughout
- Guide the student through the act structure in order
- Use the FOCUS WORDS naturally in your responses; if they don't fit the moment, model one in your own line rather than forcing the student
- When the student uses a target word, acknowledge it positively and naturally move forward
- Keep responses concise (1-3 sentences)
- In the Main act, introduce organic twists or complications to make the conversation feel real (do NOT rely on pre-written twists)
- When the student has used enough target words or the conversation has gone on long enough, move toward the Closing act and wrap up naturally
- studentReplyHints MUST be 1-3 short replies the STUDENT (playing ${scenario.role.student}) could naturally say NEXT, written IN CHARACTER. Prefer hints that naturally include one of the FOCUS WORDS above.

OUTPUT FORMAT:
{
  "text": "your response in character",
  "textZh": "简短的中文翻译，帮助学生理解",
  "motionId": "one of: wave|nod|think|gesture|clap|point|write|surprised — pick the gesture that best fits your text",
  "expressionId": "one of: happy|neutral|curious|surprised|encouraging|thoughtful — pick the facial expression that best fits your text",
  "vocabulary": ["target words you used from the TARGET VOCABULARY POOL above — only include words from that pool"],
  "vocabularySentences": ["TEACHING examples — one fresh natural example sentence per vocabulary word, never reuse a sentence from earlier turns; each sentence must include at least one word from the vocabulary list above. Use [] only if vocabulary is also empty."],
  "studentReplyHints": ["1-3 short replies the STUDENT (playing ${scenario.role.student}) could naturally say NEXT in response to your text — written IN CHARACTER, in the student's own voice. Prefer replies that fit the current scenario phase and naturally use a FOCUS WORD when it suits the moment. NEVER write meta/teaching sentences like 'You can say X when Y' or 'This is how to use X' — these are real in-character lines the student would speak. Always provide at least one hint."]
}`
}

/**
 * 将目标词汇大致均分到每一幕，每个桶对应一幕。
 */
function bucketWordsForActs(targetWords: string[], actsCount: number): { actIndex: number; words: string[] }[] {
  const count = Math.max(1, actsCount)
  const bucketSize = Math.ceil(targetWords.length / count)
  return Array.from({ length: count }, (_, i) => ({
    actIndex: i,
    words: targetWords.slice(i * bucketSize, (i + 1) * bucketSize),
  }))
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
