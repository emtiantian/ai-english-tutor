import { extractFirstJson } from '../../parsers/shared/json-extractor.js'
import type { WordExplanation, WordSense } from '@ai-english-tutor/shared'

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined
}

/**
 * 将 LLM 输出解析为 {@link WordExplanation}。
 *
 * 通过提取第一个结构完整的 JSON 对象来兼容代码围栏和尾部额外文本。
 * 当找不到可解析内容时回退到 `null`，让调用方可以降级为静态词典数据。
 */
export function parseVocabExplainResponse(
  content: string,
  fallbackWord: string,
): WordExplanation | null {
  const jsonText = extractFirstJson(content)
  if (!jsonText) return null

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return null
  }

  const rawSenses = Array.isArray(parsed.senses) ? parsed.senses : []
  const senses: WordSense[] = rawSenses
    .map((s): WordSense | null => {
      if (typeof s !== 'object' || s === null) return null
      const obj = s as Record<string, unknown>
      const meaningZh = asString(obj.meaningZh)
      if (!meaningZh) return null
      return {
        pos: asString(obj.pos) ?? '',
        meaningZh,
        exampleEn: asString(obj.exampleEn),
        exampleZh: asString(obj.exampleZh),
      }
    })
    .filter((s): s is WordSense => s !== null)

  if (senses.length === 0) return null

  const synonyms = Array.isArray(parsed.synonyms)
    ? (parsed.synonyms.filter((w) => typeof w === 'string' && w.trim().length > 0) as string[]).map((w) => w.trim())
    : undefined

  return {
    word: asString(parsed.word) ?? fallbackWord,
    phonetic: asString(parsed.phonetic),
    level: asString(parsed.level),
    senses,
    synonyms: synonyms && synonyms.length > 0 ? synonyms : undefined,
    usageNoteZh: asString(parsed.usageNoteZh),
  }
}
