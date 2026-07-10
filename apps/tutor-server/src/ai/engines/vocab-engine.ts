import { logger } from '../../logger.js'
import type { LLMProvider } from '../llm.js'
import { lookupWord } from '../../vocab/loader.js'
import {
  buildVocabExplainMessages,
  parseVocabExplainResponse,
  type WordExplanation,
} from '../prompts/vocab-explain.js'

export class VocabEngine {
  constructor(private llm: LLMProvider) {}

  /**
   * 解释单个词汇，用于词典弹窗。
   *
   * 优先使用 LLM（可覆盖任意对话词汇，给出上下文相关的释义），静态词汇库作为离线/失败兜底。
   * 仅当两者都无法给出可用解释时返回 null。
   */
  async explainWord(word: string, sentence?: string): Promise<WordExplanation | null> {
    const cleaned = word.trim()
    if (!cleaned) return null

    const staticEntry = lookupWord(cleaned)
    const hint = staticEntry
      ? { level: staticEntry.level, meaning: staticEntry.data.meaning, pos: staticEntry.data.pos }
      : undefined

    try {
      const messages = buildVocabExplainMessages(cleaned, sentence, hint)
      const response = await this.llm.complete(messages)
      const parsed = parseVocabExplainResponse(response.content, cleaned)
      if (parsed) {
        if (!parsed.level && staticEntry) parsed.level = staticEntry.level
        return parsed
      }
    } catch (err) {
      logger.error({ err, word: cleaned }, 'explainWord LLM 失败，使用静态词典兜底')
    }

    if (staticEntry) {
      return {
        word: staticEntry.data.word,
        level: staticEntry.level,
        senses: [{ pos: staticEntry.data.pos, meaningZh: staticEntry.data.meaning }],
      }
    }
    return null
  }
}
