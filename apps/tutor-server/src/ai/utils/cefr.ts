import type { CEFRLevel } from '@ai-english-tutor/shared'

export const CEFR_LEVELS: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export function levelNumToCEFR(level: number): CEFRLevel {
  return CEFR_LEVELS[Math.min(Math.max(level - 1, 0), CEFR_LEVELS.length - 1)] ?? 'A1'
}
