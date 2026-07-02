import assert from 'node:assert'
import {
  buildVocabExplainMessages,
  parseVocabExplainResponse,
} from './vocab-explain.js'

async function main(): Promise<void> {
  // ── buildVocabExplainMessages folds sentence + hint into the prompt ──
  const messages = buildVocabExplainMessages('abandon', 'They had to abandon the ship.', {
    level: 'B2',
    meaning: '放弃',
    pos: 'v.',
  })
  assert.equal(messages.length, 2, 'should build system + user messages')
  assert.equal(messages[0].role, 'system')
  const userContent = String(messages[1].content)
  assert(userContent.includes('abandon'), 'user prompt should include the word')
  assert(userContent.includes('They had to abandon the ship.'), 'user prompt should include the sentence')
  assert(userContent.includes('B2'), 'user prompt should include known level hint')

  // ── Normal single-JSON response ──
  const normal = parseVocabExplainResponse(
    JSON.stringify({
      word: 'abandon',
      phonetic: '/əˈbændən/',
      senses: [
        { pos: 'v.', meaningZh: '放弃；抛弃', exampleEn: 'They abandoned the plan.', exampleZh: '他们放弃了这个计划。' },
      ],
      synonyms: ['desert', 'forsake'],
      usageNoteZh: '常用于 abandon sth/sb 结构。',
    }),
    'abandon',
  )
  assert(normal, 'normal JSON should parse')
  assert.equal(normal!.word, 'abandon')
  assert.equal(normal!.phonetic, '/əˈbændən/')
  assert.equal(normal!.senses.length, 1)
  assert.equal(normal!.senses[0].meaningZh, '放弃；抛弃')
  assert.deepEqual(normal!.synonyms, ['desert', 'forsake'])

  // ── Wrapped in a code fence ──
  const fenced = parseVocabExplainResponse(
    '```json\n' + JSON.stringify({ word: 'run', senses: [{ pos: 'v.', meaningZh: '跑' }] }) + '\n```',
    'run',
  )
  assert(fenced, 'code-fenced JSON should parse')
  assert.equal(fenced!.senses[0].meaningZh, '跑')

  // ── Trailing prose after the JSON object ──
  const trailing = parseVocabExplainResponse(
    JSON.stringify({ word: 'book', senses: [{ pos: 'n.', meaningZh: '书' }] }) + '\n\n希望这个解释对你有帮助！',
    'book',
  )
  assert(trailing, 'JSON with trailing prose should parse')
  assert.equal(trailing!.word, 'book')

  // ── word missing → fall back to fallbackWord ──
  const noWord = parseVocabExplainResponse(
    JSON.stringify({ senses: [{ pos: 'adj.', meaningZh: '快乐的' }] }),
    'happy',
  )
  assert(noWord, 'JSON without word should still parse')
  assert.equal(noWord!.word, 'happy', 'should use fallbackWord when word missing')

  // ── No usable senses → null ──
  const empty = parseVocabExplainResponse(JSON.stringify({ word: 'x', senses: [] }), 'x')
  assert.equal(empty, null, 'empty senses should return null')

  const sensesMissingMeaning = parseVocabExplainResponse(
    JSON.stringify({ word: 'x', senses: [{ pos: 'n.' }] }),
    'x',
  )
  assert.equal(sensesMissingMeaning, null, 'senses without meaningZh should return null')

  // ── Non-JSON garbage → null ──
  assert.equal(parseVocabExplainResponse('sorry, I cannot help', 'x'), null, 'no JSON should return null')

  console.log('✅ vocab-explain parser test passed')
}

main().catch((err) => {
  console.error('❌ vocab-explain parser test failed:', err)
  process.exitCode = 1
})
