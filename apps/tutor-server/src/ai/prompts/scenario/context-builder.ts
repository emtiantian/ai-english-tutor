import { type CEFRLevel, type Scenario } from '@ai-english-tutor/shared'

/**
 * 构建要注入 system prompt 的场景上下文块。
 */
export function buildScenarioContext(
  scenario: Scenario,
  targetLevel: CEFRLevel,
  targetWords: string[],
  state?: {
    currentActIndex?: number
    wordsUsed?: string[]
  },
): string {
  // 计算当前幕和词汇使用情况，用于生成焦点词/已用词/即将出现的词
  const actsCount = scenario.acts?.length ?? 3
  const buckets = bucketWordsForActs(targetWords, actsCount)
  const currentActIndex = Math.min(
    buckets.length - 1,
    Math.max(0, state?.currentActIndex ?? 0),
  )
  const currentBucket = buckets[currentActIndex]

  const usedSet = new Set((state?.wordsUsed ?? []).map((w) => w.toLowerCase()))
  const usedTargetWords = targetWords.filter((w) => usedSet.has(w.toLowerCase()))

  const focusWords = currentBucket.words.filter(
    (w) => !usedSet.has(w.toLowerCase()),
  )
  const currentBucketUsedCount = currentBucket.words.filter(
    (w) => usedSet.has(w.toLowerCase()),
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

  const actsBlock = scenario.acts
    ? buildActsBlock(scenario.acts)
    : buildObjectivesBlock(scenario.objectives)

  const focusList = focusWords.slice(0, 5)
  const nextList = nextBucketWords.slice(0, 3)

  // 提示词：本轮焦点词 —— 告诉模型优先使用或示范这些尚未使用的目标词
  const focusSection = focusList.length
    ? `Focus words for this turn (use or model these unused words naturally, in priority order):\n${focusList.map((w) => `- ${w}`).join('\n')}`
    : `Focus words: no remaining words in the current act — move the conversation to the next act.`

  // 提示词：下一批即将出现的词 —— 当前幕接近尾声时，可轻微铺垫其中 1 个
  const nextSection = nextList.length
    ? `Coming up (when the current act is almost done, you may lightly foreshadow 1 of these):\n${nextList.map((w) => `- ${w}`).join('\n')}`
    : ''

  // 提示词：学生已使用的目标词 —— 要求模型自然回应并肯定，但不要强迫复用
  const usedSection = usedTargetWords.length
    ? `Words the student has already used (respond positively and naturally; do not force reuse):\n${usedTargetWords.map((w) => `- ${w}`).join('\n')}`
    : 'The student has not used any target words yet.'

  // 提示词：场景头部 —— 声明当前处于角色扮演场景，并给出场景设定、角色身份和目标 CEFR 等级
  const scenarioHeader = `

SCENARIO CONTEXT — You are currently inside a role-play scenario.

Setting: ${scenario.setting}
Your role: ${scenario.role.teacher}
Student's role: ${scenario.role.student}
Target CEFR level: ${targetLevel}

${actsBlock}`

  // 提示词：目标词汇池 —— 列出整段场景中需要自然穿插的所有目标词
  const vocabularyPool = `

Target vocabulary pool (${targetWords.length} words; weave them naturally throughout the whole scenario):
${targetWords.join(', ')}`

  // 提示词：当前进度 —— 说明当前幕数、本轮焦点词、即将出现的词和学生已使用的词
  const progressSection = `

Current act: ${currentActIndex + 1} / ${buckets.length}
${focusSection}
${nextSection}
${usedSection}`

  // 提示词：场景规则 —— 约束模型保持角色、按幕推进、自然使用焦点词、控制回复长度、生成学生回复提示等
  const scenarioRules = `

Scenario rules:
- Stay in character as ${scenario.role.teacher} at all times.
- Guide the student through the act structure in order.
- Use focus words naturally in your reply; if a word does not fit right now, model it in your own line instead of forcing the student.
- When the student uses a target word, affirm them positively and move the scene forward naturally.
- Keep replies concise (1-3 sentences).
- In the middle act(s), introduce natural twists or complications to make the conversation realistic (do not rely on pre-written turns).
- When the student has used enough target words or the conversation has run long enough, naturally transition to the closing act and wrap up.
- studentReplyHints must be 1-3 short replies the student (playing ${scenario.role.student}) could naturally say next, written in the student's own voice. Prefer hints that can naturally include the focus words above.`

  // 提示词：输出格式 —— 要求模型必须返回合法 JSON，并说明每个字段的含义
  const outputFormat = `

OUTPUT FORMAT — You MUST respond with valid JSON:
{
  "text": "Your in-character reply in English",
  "textZh": "A short Chinese translation to help the student understand",
  "motionId": "Choose the motion that best fits the text from wave|nod|think|gesture|clap|point|write|surprised",
  "expressionId": "Choose the expression that best fits the text from happy|neutral|curious|surprised|encouraging|thoughtful",
  "vocabulary": ["Words you used from the target vocabulary pool above, and only from that pool"],
  "vocabularySentences": ["Teaching example sentences — one fresh, natural sentence per vocabulary word; do not reuse sentences from earlier turns. Each sentence must contain at least one word from the pool above. Empty array if vocabulary is empty."],
  "studentReplyHints": ["1-3 short replies the student (playing ${scenario.role.student}) could naturally say next, written in the student's own voice. Prefer hints that fit the current scene stage and can naturally use focus words. Never write meta/teaching sentences like 'You can say X when Y' or 'This is how to use X' — these are actual lines the student would say. Provide at least one hint."]
}`

  const scenarioContextBlock = scenarioHeader + vocabularyPool + progressSection + scenarioRules + outputFormat

  return scenarioContextBlock
}

/**
 * 将目标词汇大致均分到每一幕，每个桶对应一幕。
 */
export function bucketWordsForActs(targetWords: string[], actsCount: number): { actIndex: number; words: string[] }[] {
  const count = Math.max(1, actsCount)
  const bucketSize = Math.ceil(targetWords.length / count)
  return Array.from({ length: count }, (_, i) => ({
    actIndex: i,
    words: targetWords.slice(i * bucketSize, (i + 1) * bucketSize),
  }))
}

export function buildActsBlock(acts: NonNullable<Scenario['acts']>): string {
  if (!acts || acts.length === 0) return ''
  const lines = acts.map((act, i) => {
    const labels = ['Opening', 'Body', 'Closing']
    return `${labels[i] ?? `Act ${i + 1}`}: ${act.name} — ${act.goal}`
  })
  // 提示词：三幕结构说明 —— 要求模型按顺序引导学生经历开场、主体、结尾三个阶段
  const actsBlock = `Three-act structure (guide the conversation through these stages in order):\n${lines.map((l) => `- ${l}`).join('\n')}`
  return actsBlock
}

export function buildObjectivesBlock(
  objectives: Scenario['objectives'],
): string {
  const objectivesText = objectives
    .map((obj, i) => `${i + 1}. ${obj.descriptionEn} — Keywords: [${obj.keywords.join(', ')}]`)
    .join('\n')
  // 提示词：对话阶段说明 —— 要求模型按顺序引导学生完成各个阶段目标
  const objectivesBlock = `Conversation stages (guide the student through these in order):\n${objectivesText}`
  return objectivesBlock
}
