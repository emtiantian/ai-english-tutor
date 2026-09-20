import { logger } from '../../logger.js'
import type { LLMProvider } from '../llm.js'
import {
  buildVocabExplainMessages,
  parseVocabExplainResponse,
  type WordExplanation
} from '../prompts/vocab-explain.js'

export class VocabEngine {
  constructor(private llm: LLMProvider) {}

  /**
   * 解释单个词汇，用于词典弹窗。
   *
   * 使用 LLM 生成词典式解释；上下文句子仅用于确定当前义项。
   */
  async explainWord(word: string, sentence?: string): Promise<WordExplanation | null> {
    const cleaned = word.trim()
    if (!cleaned) return null

    try {
      const messages = buildVocabExplainMessages(cleaned, sentence)
      const response = await this.llm.complete(messages, undefined, { responseFormat: 'json' })
      const parsed = parseVocabExplainResponse(response.content, cleaned)
      if (parsed) return parsed
    } catch (err) {
      logger.error({ err, word: cleaned }, 'explainWord LLM 失败')
    }
    return null
  }
}
