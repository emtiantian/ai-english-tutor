/**
 * Shared logic for picking the best student-reply hint.
 *
 * Used by both the 💡 hint UI and the tap-body "answer for me" interaction,
 * so they always agree on which hint is most valuable in the current scenario.
 */
export interface PickHintOptions {
  /** Target words for the current scenario. */
  targetWords?: string[]
  /** Words already marked as learned in the current scenario. */
  wordsLearned?: string[]
}

/**
 * Pick the best phrase from a candidate list:
 *   1. Prefer one containing an unlearned target word
 *   2. Then any target word
 *   3. Otherwise fall back to the first candidate
 *
 * Returns `undefined` if the candidate list is empty.
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
