/**
 * 场景词汇教学策略。
 *
 * 业务流程只依赖这个结构；需要更换规则时，可替换默认策略或向纯函数传入新策略，
 * 无需修改场景引擎、提示词或响应编排代码。
 */
export interface VocabularyPolicy {
  /** 单个场景最多准备多少个相关目标词。 */
  targetPoolSize: number
  /** 每轮提供给 LLM 优先使用的目标词数量。 */
  focusWordsPerTurn: number
  /** 单轮回复最多向用户标注多少个实际出现的目标词。 */
  maxAnnotatedWordsPerReply: number
  /** 目标等级、低一等级复习、高一等级挑战的初始抽取比例。 */
  levelMix: {
    primary: number
    review: number
    challenge: number
  }
}

export const DEFAULT_VOCABULARY_POLICY: Readonly<VocabularyPolicy> = Object.freeze({
  targetPoolSize: 100,
  focusWordsPerTurn: 10,
  maxAnnotatedWordsPerReply: 3,
  levelMix: Object.freeze({
    primary: 0.7,
    review: 0.2,
    challenge: 0.1
  })
})
