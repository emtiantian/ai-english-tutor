import { describe, it, expect } from 'vitest'
import { parseTeachingResponse } from '@/ai/parsers/teaching-response.js'

describe('parseTeachingResponse', () => {
  it('parses valid JSON object directly', () => {
    const validJson = parseTeachingResponse(
      '{"text":"Hello!","textZh":"你好！","vocabulary":["hello"],"vocabularySentences":["Hello there."],"studentReplyHints":["Hi, nice to meet you!"]}',
    )
    expect(validJson.text).toBe('Hello!')
    expect(validJson.textZh).toBe('你好！')
    expect(validJson.vocabulary).toEqual(['hello'])
    expect(validJson.vocabularySentences).toEqual(['Hello there.'])
    expect(validJson.studentReplyHints).toEqual(['Hi, nice to meet you!'])
    expect(validJson.motionId).toBe('wave')
    expect(validJson.intent).toBe('greeting')
  })

  it('parses JSON inside markdown code block', () => {
    const markdown = parseTeachingResponse(
      'Here is the response:\n```json\n{"text":"Excellent work!","vocabulary":[]}\n```',
    )
    expect(markdown.text).toBe('Excellent work!')
    expect(markdown.intent).toBe('praise')
  })

  it('falls back to raw text when no JSON is present', () => {
    const noJson = parseTeachingResponse('What is your name?')
    expect(noJson.text).toBe('What is your name?')
    expect(noJson.intent).toBe('question')
  })

  it('falls back to raw text on malformed JSON', () => {
    const malformed = parseTeachingResponse('{"text":"broken", "vocabulary":}')
    expect(malformed.text).toBe('{"text":"broken", "vocabulary":}')
    expect(malformed.vocabulary).toBeUndefined()
  })

  it('handles empty content', () => {
    const empty = parseTeachingResponse('')
    expect(empty.text).toBe('')
    expect(empty.intent).toBe('empty')
  })

  it('filters non-string and empty vocabulary sentences', () => {
    const mixed = parseTeachingResponse(
      '{"text":"Ok","vocabulary":["a","b"],"vocabularySentences":["Good sentence", 123, "", "Another"]}',
    )
    expect(mixed.vocabulary).toEqual(['a', 'b'])
    expect(mixed.vocabularySentences).toEqual(['Good sentence', 'Another'])
  })

  it('filters non-string and empty student reply hints', () => {
    const hintsMixed = parseTeachingResponse(
      '{"text":"Ok","studentReplyHints":["Hi there", "", null, 42, "Sure!"]}',
    )
    expect(hintsMixed.studentReplyHints).toEqual(['Hi there', 'Sure!'])
  })

  it('returns undefined when studentReplyHints is missing', () => {
    const noHints = parseTeachingResponse('{"text":"Hi","vocabulary":["hi"]}')
    expect(noHints.studentReplyHints).toBeUndefined()
  })

  it('returns undefined when studentReplyHints is not an array', () => {
    const badHints = parseTeachingResponse('{"text":"Hi","studentReplyHints":"not-an-array"}')
    expect(badHints.studentReplyHints).toBeUndefined()
  })

  it('uses valid LLM motion/expression over analyzer', () => {
    const llmDriven = parseTeachingResponse(
      '{"text":"What is your name?","motionId":"point","expressionId":"curious"}',
    )
    expect(llmDriven.motionId).toBe('point')
    expect(llmDriven.expressionId).toBe('curious')
    expect(llmDriven.intent).toBe('llm')
  })

  it('falls back to analyzer when LLM motion/expression is invalid', () => {
    const llmInvalid = parseTeachingResponse(
      '{"text":"What is your name?","motionId":"backflip","expressionId":"angry"}',
    )
    expect(llmInvalid.motionId).toBe('think')
    expect(llmInvalid.intent).toBe('question')
  })
})
