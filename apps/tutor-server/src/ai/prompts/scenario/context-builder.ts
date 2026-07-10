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
    const labels = ['开场', '主体', '结尾']
    return `${labels[i] ?? `第 ${i + 1} 幕`}: ${act.name} — ${act.goal}`
  })
  return `三幕结构（按顺序引导对话经历以下阶段）：\n${lines.map((l) => `- ${l}`).join('\n')}`
}

export function buildObjectivesBlock(
  objectives: Scenario['objectives'],
): string {
  const objectivesText = objectives
    .map((obj, i) => `${i + 1}. ${obj.descriptionEn} — 关键词：[${obj.keywords.join(', ')}]`)
    .join('\n')
  return `对话阶段（按顺序引导学生完成）：\n${objectivesText}`
}
