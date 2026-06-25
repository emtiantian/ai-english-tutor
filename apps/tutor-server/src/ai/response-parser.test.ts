import assert from 'node:assert'
import { parseTeachingResponse } from './response-parser.js'

async function main(): Promise<void> {
  // Valid JSON object directly in content
  const validJson = parseTeachingResponse(
    '{"text":"Hello!","textZh":"你好！","vocabulary":["hello"],"vocabularySentences":["Hello there."],"studentReplyHints":["Hi, nice to meet you!"]}',
  )
  assert.strictEqual(validJson.text, 'Hello!')
  assert.strictEqual(validJson.textZh, '你好！')
  assert.deepStrictEqual(validJson.vocabulary, ['hello'])
  assert.deepStrictEqual(validJson.vocabularySentences, ['Hello there.'])
  assert.deepStrictEqual(validJson.studentReplyHints, ['Hi, nice to meet you!'])
  assert.strictEqual(validJson.motionId, 'wave', 'greeting text maps to wave motion')
  assert.strictEqual(validJson.intent, 'greeting')

  // JSON embedded in markdown code block
  const markdown = parseTeachingResponse(
    'Here is the response:\n```json\n{"text":"Excellent work!","vocabulary":[]}\n```',
  )
  assert.strictEqual(markdown.text, 'Excellent work!')
  assert.strictEqual(markdown.intent, 'praise')

  // No JSON: fallback to raw text, motion still analyzed
  const noJson = parseTeachingResponse('What is your name?')
  assert.strictEqual(noJson.text, 'What is your name?')
  assert.strictEqual(noJson.intent, 'question')

  // Malformed JSON: fallback to raw text, no crash
  const malformed = parseTeachingResponse('{"text":"broken", "vocabulary":}')
  assert.strictEqual(malformed.text, '{"text":"broken", "vocabulary":}')
  assert.strictEqual(malformed.vocabulary, undefined)

  // Empty content
  const empty = parseTeachingResponse('')
  assert.strictEqual(empty.text, '')
  assert.strictEqual(empty.intent, 'empty')

  // vocabularySentences filters out non-string / empty entries
  const mixed = parseTeachingResponse(
    '{"text":"Ok","vocabulary":["a","b"],"vocabularySentences":["Good sentence", 123, "", "Another"]}',
  )
  assert.deepStrictEqual(mixed.vocabulary, ['a', 'b'])
  assert.deepStrictEqual(mixed.vocabularySentences, ['Good sentence', 'Another'])

  // studentReplyHints filters out non-string / empty entries (same rules as vocabularySentences)
  const hintsMixed = parseTeachingResponse(
    '{"text":"Ok","studentReplyHints":["Hi there", "", null, 42, "Sure!"]}',
  )
  assert.deepStrictEqual(hintsMixed.studentReplyHints, ['Hi there', 'Sure!'])

  // studentReplyHints absent → undefined
  const noHints = parseTeachingResponse('{"text":"Hi","vocabulary":["hi"]}')
  assert.strictEqual(noHints.studentReplyHints, undefined)

  // studentReplyHints non-array → undefined (not crash)
  const badHints = parseTeachingResponse('{"text":"Hi","studentReplyHints":"not-an-array"}')
  assert.strictEqual(badHints.studentReplyHints, undefined)

  console.log('✅ response-parser test passed')
}

main()
  .catch((err) => {
    console.error('❌ response-parser test failed:', err)
    process.exitCode = 1
  })
