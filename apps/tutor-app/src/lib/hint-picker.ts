/**
 * 选择最佳学生回复提示的共享逻辑。
 *
 * 💡 提示 UI 和点击身体“帮我回答”交互都会用到它，
 * 这样两者在当前场景下对“哪个提示最有价值”始终保持一致。
 */
export interface PickHintOptions {
  /** 当前场景的目标词。 */
  targetWords?: string[]
  /** 当前场景中已标记为掌握的词。 */
  wordsLearned?: string[]
}

/**
 * 从候选列表中挑选最佳表达：
 *   1. 优先包含未掌握目标词的表达
 *   2. 然后包含任意目标词的表达
 *   3. 否则回退到第一条候选
 *
 * 候选列表为空时返回 undefined。
 */
export function pickBestStudentHint(
  candidates: string[],
  options: PickHintOptions = {},
): string | undefined {
  if (candidates.length === 0) return undefined

  const learnedSet = new Set((options.wordsLearned ?? []).map((w) => w.toLowerCase()))
  const targetWords = options.targetWords ?? []
  const unlearnedWords = targetWords.filter((w) => !learnedSet.has(w.toLowerCase()))

  const findMatch = (words: string[]) =>
    candidates.find((s) =>
      words.some((w) => s.toLowerCase().includes(w.toLowerCase())),
    )

  return findMatch(unlearnedWords) || findMatch(targetWords) || candidates[0]
}
