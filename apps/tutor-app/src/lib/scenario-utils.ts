/**
 * 计算场景目标词覆盖率，返回 0-1 之间的比例。
 *
 * 优先使用后端下发的 coverageRate；若未下发则根据已学词数/目标词总数计算。
 */
export function computeCoverageRate(
  wordsLearned: string[],
  targetWordsTotal: number,
  coverageRate?: number,
): number {
  if (typeof coverageRate === 'number') return coverageRate
  if (!targetWordsTotal) return 0
  return wordsLearned.length / targetWordsTotal
}
