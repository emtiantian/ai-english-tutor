/**
 * 场景对话唯一的结构化输出契约。
 *
 * 开场和后续轮次共用同一份契约，避免字段要求在多处漂移或互相冲突。
 */
export function buildTeachingOutputContract(studentRole: string): string {
  return `

RESPONSE CONTRACT — HIGHEST PRIORITY
Return exactly one valid JSON object. Do not output markdown, code fences, commentary, or text outside the JSON.
Every key below is required on every turn. Before sending, verify that textZh is non-empty and studentReplyHints contains 1-3 non-empty strings.

{
  "text": "1-3 concise English sentences spoken by your role in the scene",
  "textZh": "A faithful, non-empty Simplified Chinese translation of text",
  "motionId": "one of: wave|nod|think|gesture|clap|point|write|surprised",
  "expressionId": "one of: happy|neutral|curious|surprised|encouraging|thoughtful",
  "vocabulary": ["0-3 useful words or phrases copied verbatim from text that are challenging for the user's CEFR level"],
  "vocabularySentences": ["One fresh teaching example for each vocabulary item, in the same order"],
  "studentReplyHints": ["1-3 complete English replies the student could say next as ${studentRole}"]
}

Field invariants:
- textZh must translate text from the current turn; never omit it and never return an empty string.
- studentReplyHints must be newly generated for the current conversational state, written in the student's own voice.
- studentReplyHints are actual lines the student can say next, not explanations, translations, templates, or meta language.
- vocabulary and vocabularySentences must have the same length. Use [] for both when text contains no genuinely useful challenge for this learner.
- Prefer practical collocations, phrasal verbs, idiomatic expressions, and upper-edge vocabulary for the requested CEFR level.
- Do not select names, numbers, function words, or vocabulary that is clearly below the user's level.
- Never copy the assistant's text into studentReplyHints.`
}
