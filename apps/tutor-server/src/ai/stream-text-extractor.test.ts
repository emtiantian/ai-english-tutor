import assert from 'node:assert'
import { JsonTextStreamExtractor } from './stream-text-extractor.js'

/**
 * 辅助函数：输入一系列 chunk 并收集所有输出。
 * 每次 push() 返回一个条目（因此空字符串也可见）。
 */
function feed(chunks: string[]): { emitted: string[]; combined: string } {
  const ex = new JsonTextStreamExtractor()
  const emitted: string[] = []
  for (const c of chunks) emitted.push(ex.push(c))
  emitted.push(ex.flush())
  return { emitted, combined: emitted.join('') }
}

async function main(): Promise<void> {
  // ── 1. 单次完整 JSON ────────────────────────────
  {
    const r = feed(['{"text":"hello"}'])
    assert.strictEqual(r.combined, 'hello', 'simple one-shot text')
  }

  // ── 2. JSON 对象前的推理文本被丢弃 ──
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
    // 第一个 chunk（推理文本）必须不产生输出
    assert.strictEqual(r.emitted[0], '', 'reasoning prefix emits nothing')
  }

  // ── 3. `text` 后的其他字段被静默吞掉 ─────
  {
    const r = feed(['{"text":"hi","textZh":"你好","vocabulary":["x"]}'])
    assert.strictEqual(
      r.combined,
      'hi',
      'textZh / vocabulary must NOT leak into the visible chunk stream',
    )
  }

  // ── 4. `text` 前的其他字段也被丢弃 ──────────
  {
    const r = feed(['{"motionId":"wave","text":"hi"}'])
    assert.strictEqual(r.combined, 'hi', 'fields before text are skipped')
  }

  // ── 5. chunk 边界落在 `"text":"` 字面量内 ─────────
  {
    const r = feed(['{"te', 'xt":', '"hi"}'])
    assert.strictEqual(r.combined, 'hi', 'split key boundary is recoverable')
  }

  // ── 6. chunk 边界正好位于反斜杠转义处 ───────────
  {
    const r = feed(['{"text":"line1\\', 'nline2"}'])
    assert.strictEqual(
      r.combined,
      'line1\nline2',
      '\\n escape split across chunks must decode correctly',
    )
  }

  // ── 7. chunk 边界落在 \uXXXX unicode 转义内 ────────
  {
    const r = feed(['{"text":"\\u00', '4Bay"}'])
    assert.strictEqual(r.combined, 'Kay', 'split \\uXXXX must decode correctly')
  }

  // ── 8. text 值的结束引号到达 → 完成；忽略后续输入 ──
  {
    const r = feed(['{"text":"done"}', '{"text":"again"}', 'trailing junk'])
    assert.strictEqual(r.combined, 'done', 'after text closes, no more output')
  }

  // ── 9. LLM 从未输出 JSON 对象 → 无输出（优雅跳过） ──
  {
    const r = feed(['just plain prose, no json here, no braces'])
    assert.strictEqual(r.combined, '', 'no `{` → no output')
  }

  // ── 10. JSON 关闭但没有 `text` 字段 → 无输出 ──────
  {
    const r = feed(['{"motionId":"wave","vocabulary":[]}'])
    assert.strictEqual(r.combined, '', 'no `text` key → no output')
  }

  // ── 11. 嵌套对象值（其他字段）不会混淆扫描器 ──
  {
    const r = feed([
      '{"meta":{"a":1,"b":[1,2,3]},"text":"after nested","x":"y"}',
    ])
    assert.strictEqual(r.combined, 'after nested', 'nested values are skipped, text still found')
  }

  // ── 12. 字符串值中包含字面量 `"text":"` 不会误匹配 ──
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

  // ── 13. `:` 与值起始处的空白 ───────────────
  {
    const r = feed(['{ "text" : "spaced" }'])
    assert.strictEqual(r.combined, 'spaced', 'whitespace tolerant')
  }

  // ── 14. 逐字符流式 ──────────────────────────────
  {
    const full = '{"motionId":"wave","text":"hello world"}'
    const chunks = full.split('')
    const r = feed(chunks)
    assert.strictEqual(r.combined, 'hello world', 'char-by-char streaming works')
  }

  // ── 15. 流式过程中多个输出窗口 ──────────────
  {
    const ex = new JsonTextStreamExtractor()
    const a = ex.push('{"text":"part1 ')
    const b = ex.push('part2 ')
    const c = ex.push('part3"}')
    assert.strictEqual(a, 'part1 ', 'first chunk emits as it arrives')
    assert.strictEqual(b, 'part2 ', 'second chunk emits as it arrives')
    assert.strictEqual(c, 'part3', 'third chunk emits up to the closing quote')
  }

  // ── 16. 包含 `{` 的推理文本不可被误认为 JSON ──
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

  // ── 17. 混合：包含花括号的 <think> 标签，然后是真实 JSON ──
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
