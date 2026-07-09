import assert from 'node:assert'
import { parseTeachingResponse } from './response-parser.js'

async function main(): Promise<void> {
  // 内容中直接包含有效 JSON 对象
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

  // JSON 嵌套在 markdown 代码块中
  const markdown = parseTeachingResponse(
    'Here is the response:\n```json\n{"text":"Excellent work!","vocabulary":[]}\n```',
  )
  assert.strictEqual(markdown.text, 'Excellent work!')
  assert.strictEqual(markdown.intent, 'praise')

  // 无 JSON：回退到原始文本，仍分析动作
  const noJson = parseTeachingResponse('What is your name?')
  assert.strictEqual(noJson.text, 'What is your name?')
  assert.strictEqual(noJson.intent, 'question')

  // JSON 格式错误：回退到原始文本，不崩溃
  const malformed = parseTeachingResponse('{"text":"broken", "vocabulary":}')
  assert.strictEqual(malformed.text, '{"text":"broken", "vocabulary":}')
  assert.strictEqual(malformed.vocabulary, undefined)

  // 空内容
  const empty = parseTeachingResponse('')
  assert.strictEqual(empty.text, '')
  assert.strictEqual(empty.intent, 'empty')

  // vocabularySentences 过滤掉非字符串 / 空条目
  const mixed = parseTeachingResponse(
    '{"text":"Ok","vocabulary":["a","b"],"vocabularySentences":["Good sentence", 123, "", "Another"]}',
  )
  assert.deepStrictEqual(mixed.vocabulary, ['a', 'b'])
  assert.deepStrictEqual(mixed.vocabularySentences, ['Good sentence', 'Another'])

  // studentReplyHints 过滤掉非字符串 / 空条目（规则与 vocabularySentences 相同）
  const hintsMixed = parseTeachingResponse(
    '{"text":"Ok","studentReplyHints":["Hi there", "", null, 42, "Sure!"]}',
  )
  assert.deepStrictEqual(hintsMixed.studentReplyHints, ['Hi there', 'Sure!'])

  // studentReplyHints 缺失 → undefined
  const noHints = parseTeachingResponse('{"text":"Hi","vocabulary":["hi"]}')
  assert.strictEqual(noHints.studentReplyHints, undefined)

  // studentReplyHints 非数组 → undefined（不崩溃）
  const badHints = parseTeachingResponse('{"text":"Hi","studentReplyHints":"not-an-array"}')
  assert.strictEqual(badHints.studentReplyHints, undefined)

  // LLM 提供的有效 motion/expression 覆盖关键词分析器结果
  const llmDriven = parseTeachingResponse(
    '{"text":"What is your name?","motionId":"point","expressionId":"curious"}',
  )
  assert.strictEqual(llmDriven.motionId, 'point', 'valid LLM motionId is used verbatim')
  assert.strictEqual(llmDriven.expressionId, 'curious', 'valid LLM expressionId is used verbatim')
  assert.strictEqual(llmDriven.intent, 'llm', 'intent marked llm when LLM chose the motion')

  // 无效的 LLM motion/expression 被忽略 → 回退到分析器
  const llmInvalid = parseTeachingResponse(
    '{"text":"What is your name?","motionId":"backflip","expressionId":"angry"}',
  )
  assert.strictEqual(llmInvalid.motionId, 'think', 'invalid LLM motionId falls back to analyzer (question→think)')
  assert.strictEqual(llmInvalid.intent, 'question', 'intent stays analyzer intent when LLM id invalid')

  console.log('✅ response-parser test passed')
}

main()
  .catch((err) => {
    console.error('❌ response-parser test failed:', err)
    process.exitCode = 1
  })
