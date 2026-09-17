import { DEFAULT_VOCABULARY_POLICY } from '../vocabulary-policy.js'

interface VocabularyReply {
  text: string
  vocabulary?: string[]
  vocabularySentences?: string[]
}

function containsTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text)
}

/**
 * 校验模型按学习者难度挑出的生词：必须逐字出现在正文中、例句一一对应、
 * 尚未在当前会话标注，并限制单轮数量。难度判断由拥有完整语境的 LLM 完成。
 */
export function ensureReplyVocabulary<T extends VocabularyReply>(
  parsed: T,
  previouslyAnnotated: Iterable<string> = [],
  maxWords: number = DEFAULT_VOCABULARY_POLICY.maxAnnotatedWordsPerReply
): T {
  const previous = new Set(Array.from(previouslyAnnotated, term => term.toLowerCase()))
  const selected: string[] = []
  const examples: string[] = []
  const selectedKeys = new Set<string>()

  for (const [index, rawTerm] of (parsed.vocabulary ?? []).entries()) {
    const term = rawTerm.trim()
    const key = term.toLowerCase()
    const example = parsed.vocabularySentences?.[index]?.trim()
    if (!term || !example || previous.has(key) || selectedKeys.has(key)) continue
    if (!containsTerm(parsed.text, term)) continue
    selectedKeys.add(key)
    selected.push(term)
    examples.push(example)
    if (selected.length >= Math.max(0, maxWords)) break
  }

  return { ...parsed, vocabulary: selected, vocabularySentences: examples }
}
