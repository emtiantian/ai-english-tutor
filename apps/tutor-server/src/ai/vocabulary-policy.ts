/**
 * 对话生词标注策略。
 *
 * 生词由 LLM 根据用户难度和当前回复选择；这里仅保留确定性的展示上限。
 */
export interface VocabularyPolicy {
  /** 单轮回复最多向用户标注多少个实际出现的目标词。 */
  maxAnnotatedWordsPerReply: number
}

export const DEFAULT_VOCABULARY_POLICY: Readonly<VocabularyPolicy> = Object.freeze({
  maxAnnotatedWordsPerReply: 3
})
