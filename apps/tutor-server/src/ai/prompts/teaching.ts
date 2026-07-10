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
 * 从角色预设列表中固定挑选默认开场风格
 *
 * 优先使用 `lazy-mature`；找不到时回退到第一个风格。
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

词汇复习 — 学生需要练习这些单词。请在全新语境（与之前对话不同）中自然地把它们融入回复；不要生硬插入，有机编织即可。若某个词不适合当前情境，可跳过。

需要复习的单词：${wordList}

使用复习词后，请将其纳入 JSON 响应的 "vocabulary" 字段；并在 "vocabularySentences" 中为每个复习词提供一句例句，每句例句必须自然包含至少一个上述复习词。`
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
 * 使用传入的风格（或从角色中固定挑选默认风格）并将人格注入 system prompt。
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
        `学生刚刚开始了一节 Level ${level} 的课程。` +
        `${chosen.persona} ` +
        `请用符合该人格的语气热情地欢迎学生（1-2 句话），然后简要介绍今天会学习什么。`,
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
        `学生正在开始一个角色扮演场景："${scenario.nameEn}"，CEFR 等级为 ${targetLevel}。` +
        `场景设定：${scenario.setting} ` +
        `请自然地开启场景，用角色身份介绍场景背景和你扮演的角色。` +
        `不要解释学习目标——就像事情真的在发生一样直接开始对话。`,
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

词汇复习 — 如果这些词适合当前场景，也请尽量自然地使用：
单词：${wordList}
请将使用到的词纳入 "vocabulary" 字段，并在 "vocabularySentences" 中为每个词提供一句例句，每句例句必须自然包含至少一个上述单词。`
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

台词复用（合适时原样说出）—— 以下是你在当前这个场景和 CEFR 等级中已经说过的台词。如果其中某一句在当前情境下自然且符合角色，请逐字复用（包括标点完全一致）作为你的 "text" 字段内容。仅当没有合适台词时才撰写新的 "text"。这能保持你的声线一致。此规则仅适用于 "text" 字段；"textZh"、"vocabularySentences" 和 "studentReplyHints" 仍需遵循各自规则。

已说过的台词：
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
    ? `本轮焦点词（自然地使用或示范这些未使用的词，按优先级）：\n${focusList.map((w) => `- ${w}`).join('\n')}`
    : `本轮焦点词：当前幕已无剩余 — 推进对话至下一幕。`

  const nextSection = nextList.length
    ? `即将出现（当前幕接近尾声时，可轻微铺垫其中 1 个）：\n${nextList.map((w) => `- ${w}`).join('\n')}`
    : ''

  const usedSection = usedTargetWords.length
    ? `学生已使用（积极地自然回应，不要强迫复用）：\n${usedTargetWords.map((w) => `- ${w}`).join('\n')}`
    : '学生尚未使用目标词汇。'

  return `

场景上下文 — 你现在正处于角色扮演场景中。

场景设定：${scenario.setting}
你的角色：${scenario.role.teacher}
学生的角色：${scenario.role.student}
目标 CEFR 等级：${targetLevel}

${actsBlock}

目标词汇池（共 ${targetWords.length} 个词，需在整段场景中自然穿插）：
${targetWords.join(', ')}

当前幕：第 ${currentActIndex + 1} / ${buckets.length} 幕
${focusSection}
${nextSection}
${usedSection}

场景规则：
- 始终扮演 ${scenario.role.teacher} 的角色
- 按顺序引导学生经历幕结构
- 在你的回复中自然地使用焦点词；若当下不适合，可在自己的台词中示范一个，而非强迫学生
- 当学生使用目标词时，积极地肯定并自然推进
- 保持回复简洁（1-3 句话）
- 在主体幕中，引入自然的转折或复杂情况，让对话更真实（不要依赖预写转折）
- 当学生已使用足够目标词或对话已足够长时，自然转向结尾幕并收尾
- studentReplyHints 必须是 1-3 句学生（扮演 ${scenario.role.student}）接下来可能自然说出的简短回复，以学生本人的口吻书写。优先选择能自然包含上述焦点词的提示。

输出格式（必须返回合法 JSON）：
{
  "text": "你的角色回复（英文）",
  "textZh": "简短的中文翻译，帮助学生理解",
  "motionId": "从 wave|nod|think|gesture|clap|point|write|surprised 中选择最贴合文本的动作",
  "expressionId": "从 happy|neutral|curious|surprised|encouraging|thoughtful 中选择最贴合文本的表情",
  "vocabulary": ["你使用的、来自上方目标词汇池的单词，仅限该池中的词"],
  "vocabularySentences": ["教学例句——每个词汇对应一句新鲜自然的例句，不要复用之前回合的句子；每句必须包含至少一个上方词汇表中的词。若 vocabulary 为空，则此项也为空数组。"],
  "studentReplyHints": ["1-3 句学生（扮演 ${scenario.role.student}）接下来可能自然说出的简短回复，以学生自己的口吻书写。优先选择符合当前场景阶段、并能自然使用焦点词的提示。永远不要写元/教学句，如'你可以在说 X 时用 Y'或'这是 X 的用法'——这些是学生真正会说出的角色台词。至少提供一条提示。"]
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
    const labels = ['开场', '主体', '结尾']
    return `${labels[i] ?? `第 ${i + 1} 幕`}: ${act.name} — ${act.goal}`
  })
  return `三幕结构（按顺序引导对话经历以下阶段）：\n${lines.map((l) => `- ${l}`).join('\n')}`
}

function buildObjectivesBlock(
  objectives: Scenario['objectives'],
): string {
  const objectivesText = objectives
    .map((obj, i) => `${i + 1}. ${obj.descriptionEn} — 关键词：[${obj.keywords.join(', ')}]`)
    .join('\n')
  return `对话阶段（按顺序引导学生完成）：\n${objectivesText}`
}
