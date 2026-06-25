import assert from 'node:assert'
import { JsonTextStreamExtractor } from './stream-text-extractor.js'

/**
 * Helper: feed a sequence of chunks and collect everything emitted.
 * Returns one entry per push() (so empty strings are visible).
 */
function feed(chunks: string[]): { emitted: string[]; combined: string } {
  const ex = new JsonTextStreamExtractor()
  const emitted: string[] = []
  for (const c of chunks) emitted.push(ex.push(c))
  emitted.push(ex.flush())
  return { emitted, combined: emitted.join('') }
}

async function main(): Promise<void> {
  // ── 1. Single-shot complete JSON ────────────────────────────
  {
    const r = feed(['{"text":"hello"}'])
    assert.strictEqual(r.combined, 'hello', 'simple one-shot text')
  }

  // ── 2. Reasoning prose dumped before the JSON object is dropped ──
  {
    const r = feed([
      '让我想想。用户在问候我，所以我应该用同样温暖的方式回应。',
      '{"text":"',
      'Hello',
      '!","vocabulary":["hi"]}',
    ])
    assert.strictEqual(
      r.combined,
      'Hello!',
      'pre-JSON reasoning must be dropped; only the text value is emitted',
    )
    // The first chunk (reasoning prose) must produce no output
    assert.strictEqual(r.emitted[0], '', 'reasoning prefix emits nothing')
  }

  // ── 3. Other fields after `text` are silently swallowed ─────
  {
    const r = feed(['{"text":"hi","textZh":"你好","vocabulary":["x"]}'])
    assert.strictEqual(
      r.combined,
      'hi',
      'textZh / vocabulary must NOT leak into the visible chunk stream',
    )
  }

  // ── 4. Other fields BEFORE `text` are also dropped ──────────
  {
    const r = feed(['{"motionId":"wave","text":"hi"}'])
    assert.strictEqual(r.combined, 'hi', 'fields before text are skipped')
  }

  // ── 5. Chunk boundary inside the `"text":"` literal ─────────
  {
    const r = feed(['{"te', 'xt":', '"hi"}'])
    assert.strictEqual(r.combined, 'hi', 'split key boundary is recoverable')
  }

  // ── 6. Chunk boundary right at a backslash escape ───────────
  {
    const r = feed(['{"text":"line1\\', 'nline2"}'])
    assert.strictEqual(
      r.combined,
      'line1\nline2',
      '\\n escape split across chunks must decode correctly',
    )
  }

  // ── 7. Chunk boundary inside a \uXXXX unicode escape ────────
  {
    const r = feed(['{"text":"\\u00', '4Bay"}'])
    assert.strictEqual(r.combined, 'Kay', 'split \\uXXXX must decode correctly')
  }

  // ── 8. Closing quote of text value reached → DONE; further input ignored ──
  {
    const r = feed(['{"text":"done"}', '{"text":"again"}', 'trailing junk'])
    assert.strictEqual(r.combined, 'done', 'after text closes, no more output')
  }

  // ── 9. LLM never emits a JSON object → no output (graceful skip) ──
  {
    const r = feed(['just plain prose, no json here, no braces'])
    assert.strictEqual(r.combined, '', 'no `{` → no output')
  }

  // ── 10. JSON closes without a `text` field → no output ──────
  {
    const r = feed(['{"motionId":"wave","vocabulary":[]}'])
    assert.strictEqual(r.combined, '', 'no `text` key → no output')
  }

  // ── 11. Nested object value (other field) does not confuse the scanner ──
  {
    const r = feed([
      '{"meta":{"a":1,"b":[1,2,3]},"text":"after nested","x":"y"}',
    ])
    assert.strictEqual(r.combined, 'after nested', 'nested values are skipped, text still found')
  }

  // ── 12. String value containing the literal `"text":"` doesn\'t false-match ──
  {
    const r = feed([
      '{"hint":"the field named \\"text\\" is special","text":"real"}',
    ])
    assert.strictEqual(
      r.combined,
      'real',
      'a fake `\\"text\\"` inside another string value must not be picked up',
    )
  }

  // ── 13. Whitespace around `:` and value start ───────────────
  {
    const r = feed(['{ "text" : "spaced" }'])
    assert.strictEqual(r.combined, 'spaced', 'whitespace tolerant')
  }

  // ── 14. Char-by-char streaming ──────────────────────────────
  {
    const full = '{"motionId":"wave","text":"hello world"}'
    const chunks = full.split('')
    const r = feed(chunks)
    assert.strictEqual(r.combined, 'hello world', 'char-by-char streaming works')
  }

  // ── 15. Multiple emit windows during streaming ──────────────
  {
    const ex = new JsonTextStreamExtractor()
    const a = ex.push('{"text":"part1 ')
    const b = ex.push('part2 ')
    const c = ex.push('part3"}')
    assert.strictEqual(a, 'part1 ', 'first chunk emits as it arrives')
    assert.strictEqual(b, 'part2 ', 'second chunk emits as it arrives')
    assert.strictEqual(c, 'part3', 'third chunk emits up to the closing quote')
  }

  // ── 16. Reasoning prose containing `{` must not be mistaken for JSON ──
  {
    const r = feed([
      '让我想想 {这里是思考片段} 用户在问候',
      '{"text":"Hi!"}',
    ])
    assert.strictEqual(
      r.combined,
      'Hi!',
      'a stray `{` inside reasoning prose must not lock the extractor onto the wrong object',
    )
  }

  // ── 17. Hybrid: <think> tag containing braces, then real JSON ──
  {
    const r = feed([
      '<think>let me think {step 1} and {step 2}</think>',
      '{"text":"answer"}',
    ])
    assert.strictEqual(r.combined, 'answer', 'think-tag-with-braces must recover')
  }

  console.log('✅ stream-text-extractor test passed')
}

main().catch((err) => {
  console.error('❌ stream-text-extractor test failed:', err)
  process.exitCode = 1
})
