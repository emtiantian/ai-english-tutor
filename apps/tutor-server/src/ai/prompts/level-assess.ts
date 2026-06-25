import { LUNA_PERSONA, type CharacterPersona } from '@ai-english-tutor/shared'
import type { LLMMessage } from '../llm.js'

/**
 * Build messages for single-sentence English level assessment (legacy)
 */
export function buildLevelAssessMessages(
  sentence: string,
  persona: CharacterPersona = LUNA_PERSONA,
): LLMMessage[] {
  return [
    { role: 'system', content: persona.buildLevelAssessPrompt() },
    {
      role: 'user',
      content: `Please assess the English proficiency level of this sentence:\n\n"${sentence}"`,
    },
  ]
}

/**
 * Assessment result from multi-turn evaluation
 */
export interface AssessmentResult {
  vocabularyScore: number
  grammarScore: number
  fluencyScore: number
  comprehensionScore: number
  overallLevel: number
  confidence: 'low' | 'medium' | 'high'
  reason: string
}

/**
 * Build messages for multi-turn assessment (round 1-3)
 *
 * Evaluates user response and generates next question if needed.
 */
export function buildAssessmentTurnMessages(
  round: number,
  userText: string,
  previousScores: number[],
  persona: CharacterPersona = LUNA_PERSONA,
  topicSeed?: string,
): LLMMessage[] {
  const systemPrompt = `You are Luna, an expert English tutor having a friendly conversation to assess a student's level.

Current round: ${round}/3
Previous round scores: ${previousScores.length > 0 ? previousScores.join(', ') : 'none yet'}
${topicSeed ? `Topic direction: Try to frame your question around "${topicSeed}" or a related theme.` : ''}

TASK:
1. Evaluate the student's LATEST response on 4 dimensions (each 1-5):
   - vocabulary: simple words=1, varied everyday=3, sophisticated/idiomatic=5
   - grammar: basic SVO=1, mixed tenses/compound=3, complex clauses/conditionals=5
   - fluency: fragmented=1, adequate=3, natural and flowing=5
   - comprehension: off-topic=1, partially relevant=3, directly addresses question with elaboration=5

2. If round < 3, generate the NEXT question to ask. IMPORTANT: Choose a DIFFERENT topic each time. Pick from diverse categories:
   - Round 1 (simple): Ask about ONE of these — daily routines, food preferences, weather/seasons, hobbies, favorite music/movies, pets, weekend plans, hometown, school/work life, shopping habits
   - Round 2 (medium): Ask about ONE of these — a memorable trip, a skill they learned, a cultural tradition, a problem they solved, a book/story they read, a goal they have, a funny experience, a person they admire, a food they cooked, a time they helped someone
   - Round 3 (challenge): Ask about ONE of these — hypothetical life choices, ethical dilemmas, social issues, technology impact, environmental concerns, education systems, work-life balance, cultural differences, future predictions, creative problem-solving

3. Ignore spelling errors (may be from voice transcription)
4. NEVER repeat a topic that was already covered in previous rounds

OUTPUT ONLY VALID JSON:
{
  "vocabularyScore": 1-5,
  "grammarScore": 1-5,
  "fluencyScore": 1-5,
  "comprehensionScore": 1-5,
  "overallLevel": 1-5,
  "confidence": "low"|"medium"|"high",
  "reason": "Brief explanation in Chinese",
  "nextQuestion": "Your next question in English (only if round < 3, otherwise null)",
  "motionId": "wave|nod|think|gesture|clap",
  "expressionId": "happy|neutral|curious|surprised|encouraging|thoughtful"
}`

  const roundContext = round === 1
    ? 'This is the first round. Start with a warm greeting and a simple open question. Choose a fresh, engaging topic — avoid generic questions like "What do you do in your free time?" unless the topic seed suggests it.'
    : round === 2
    ? 'This is the second round. Acknowledge their answer and ask a more complex question on a COMPLETELY DIFFERENT topic from round 1.'
    : 'This is the final round. Ask a challenging question on a topic NOT covered in rounds 1 or 2. Test their upper limit.'

  return [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `${roundContext}\n\nStudent's response:\n"${userText}"`,
    },
  ]
}

/**
 * Build messages for announcing the final assessment result
 */
export function buildAssessmentResultMessages(
  finalLevel: number,
  allScores: number[],
  persona: CharacterPersona = LUNA_PERSONA,
): LLMMessage[] {
  const levelNames: Record<number, string> = {
    1: 'A1 (Beginner)',
    2: 'A2 (Elementary)',
    3: 'B1 (Intermediate)',
    4: 'B2 (Upper-Intermediate)',
    5: 'C1 (Advanced)',
  }

  const levelDescriptions: Record<number, string> = {
    1: '能理解和使用日常表达',
    2: '能完成简单日常交流',
    3: '能应对大部分旅行场景',
    4: '能流利地与人交流',
    5: '能灵活运用于社交和职场',
  }

  return [
    {
      role: 'system',
      content: `You are Luna, an English tutor. Announce the assessment result in a warm, encouraging way.
Keep it to 2-3 sentences. Mention their level and one strength you noticed.`,
    },
    {
      role: 'user',
      content: `The student has completed 3 rounds of assessment.
Final level: ${finalLevel} (${levelNames[finalLevel]})
Description: ${levelDescriptions[finalLevel]}
Round scores: ${allScores.join(', ')}

Generate a brief, encouraging announcement of their result.`,
    },
  ]
}

/**
 * Parse assessment turn result from LLM response
 */
export function parseAssessmentResult(content: string): AssessmentResult {
  try {
    const jsonMatch = content.match(/\{[\s\S]*?\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        vocabularyScore: clamp(Number(parsed.vocabularyScore) || 3, 1, 5),
        grammarScore: clamp(Number(parsed.grammarScore) || 3, 1, 5),
        fluencyScore: clamp(Number(parsed.fluencyScore) || 3, 1, 5),
        comprehensionScore: clamp(Number(parsed.comprehensionScore) || 3, 1, 5),
        overallLevel: clamp(Number(parsed.overallLevel) || 3, 1, 5),
        confidence: ['low', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : 'medium',
        reason: parsed.reason || '基于对话内容评估',
      }
    }
  } catch {
    // JSON parse failed
  }

  // Fallback: estimate based on text length
  const length = content.length
  const estimatedLevel = length < 30 ? 1 : length < 80 ? 2 : length < 150 ? 3 : length < 250 ? 4 : 5

  return {
    vocabularyScore: estimatedLevel,
    grammarScore: estimatedLevel,
    fluencyScore: estimatedLevel,
    comprehensionScore: estimatedLevel,
    overallLevel: estimatedLevel,
    confidence: 'low',
    reason: '基于回答长度的粗略评估',
  }
}

/**
 * Parse the full assessment turn response (includes nextQuestion, motionId, etc.)
 */
export function parseAssessmentTurnResponse(content: string): AssessmentResult & {
  nextQuestion?: string
  motionId?: string
  expressionId?: string
} {
  const result = parseAssessmentResult(content)

  try {
    const jsonMatch = content.match(/\{[\s\S]*?\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        ...result,
        nextQuestion: parsed.nextQuestion || undefined,
        motionId: parsed.motionId || undefined,
        expressionId: parsed.expressionId || undefined,
      }
    }
  } catch {
    // ignore
  }

  return result
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Parse level assessment result from LLM response
 */
export function parseLevelResult(content: string): {
  level: number
  reason: string
  vocabularyAnalysis?: string
  grammarAnalysis?: string
} {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*?\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        level: Math.min(5, Math.max(1, Number(parsed.level) || 3)),
        reason: parsed.reason || '基于句子复杂度评估',
        vocabularyAnalysis: parsed.vocabularyAnalysis,
        grammarAnalysis: parsed.grammarAnalysis,
      }
    }
  } catch {
    // JSON parse failed, use fallback
  }

  // Fallback: estimate based on content length
  const length = content.length
  const level = length < 50 ? 1 : length < 150 ? 2 : length < 300 ? 3 : length < 500 ? 4 : 5

  return {
    level,
    reason: `基于内容长度(${length}字符)的粗略评估`,
  }
}
