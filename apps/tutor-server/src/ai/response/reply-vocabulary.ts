import { DEFAULT_VOCABULARY_POLICY } from '../vocabulary-policy.js'

interface VocabularyReply {
  text: string
  vocabulary?: string[]
  vocabularySentences?: string[]
}

function containsWord(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text)
}

/**
 * 只保留回复正文中实际出现且属于目标词池的词，并限制单轮标注数量。
 * LLM 返回的词优先；遗漏的实际目标词再按目标池顺序补充。
 */
export function ensureReplyVocabulary<T extends VocabularyReply>(
  parsed: T,
  targetWords: string[],
  maxWords: number = DEFAULT_VOCABULARY_POLICY.maxAnnotatedWordsPerReply
): T {
  const canonicalTargets = new Map(targetWords.map(word => [word.toLowerCase(), word]))
  const selected: string[] = []
  const selectedKeys = new Set<string>()

  const addIfValid = (word: string): void => {
    const canonical = canonicalTargets.get(word.toLowerCase())
    if (!canonical || selectedKeys.has(canonical.toLowerCase())) return
    if (!containsWord(parsed.text, canonical)) return
    selectedKeys.add(canonical.toLowerCase())
    selected.push(canonical)
  }

  for (const word of parsed.vocabulary ?? []) addIfValid(word)
  for (const word of targetWords) addIfValid(word)

  const vocabulary = selected.slice(0, Math.max(0, maxWords))
  const sentenceByOriginalWord = new Map<string, string>()
  for (const [index, word] of (parsed.vocabulary ?? []).entries()) {
    const sentence = parsed.vocabularySentences?.[index]
    if (sentence) sentenceByOriginalWord.set(word.toLowerCase(), sentence)
  }
  const vocabularySentences = vocabulary
    .map(word => sentenceByOriginalWord.get(word.toLowerCase()))
    .filter((sentence): sentence is string => Boolean(sentence))
  const hasCompleteSentenceMapping = vocabularySentences.length === vocabulary.length

  return {
    ...parsed,
    vocabulary,
    vocabularySentences: hasCompleteSentenceMapping ? vocabularySentences : undefined
  }
}
