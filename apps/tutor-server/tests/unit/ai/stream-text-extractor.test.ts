import { describe, it, expect } from 'vitest'
import { JsonTextStreamExtractor } from '@/ai/stream-text-extractor.js'

function feed(chunks: string[]): { emitted: string[]; combined: string } {
  const ex = new JsonTextStreamExtractor()
  const emitted: string[] = []
  for (const c of chunks) emitted.push(ex.push(c))
  emitted.push(ex.flush())
  return { emitted, combined: emitted.join('') }
}

describe('JsonTextStreamExtractor', () => {
  it('handles a complete JSON object in one chunk', () => {
    const r = feed(['{"text":"hello"}'])
    expect(r.combined).toBe('hello')
  })

  it('drops reasoning text before JSON object', () => {
    const r = feed([
      '让我想想。用户在问候我，所以我应该用同样温暖的方式回应。',
      '{"text":"',
      'Hello',
      '!","vocabulary":["hi"]}',
    ])
    expect(r.combined).toBe('Hello!')
    expect(r.emitted[0]).toBe('')
  })

  it('does not leak other fields into visible stream', () => {
    const r = feed(['{"text":"hi","textZh":"你好","vocabulary":["x"]}'])
    expect(r.combined).toBe('hi')
  })

  it('skips fields before text', () => {
    const r = feed(['{"motionId":"wave","text":"hi"}'])
    expect(r.combined).toBe('hi')
  })

  it('recovers when chunk boundary splits key', () => {
    const r = feed(['{"te', 'xt":', '"hi"}'])
    expect(r.combined).toBe('hi')
  })

  it('decodes escaped newline split across chunks', () => {
    const r = feed(['{"text":"line1\\', 'nline2"}'])
    expect(r.combined).toBe('line1\nline2')
  })

  it('decodes split unicode escape', () => {
    const r = feed(['{"text":"\\u00', '4Bay"}'])
    expect(r.combined).toBe('Kay')
  })

  it('stops after text value closes', () => {
    const r = feed(['{"text":"done"}', '{"text":"again"}', 'trailing junk'])
    expect(r.combined).toBe('done')
  })

  it('produces no output when there is no JSON object', () => {
    const r = feed(['just plain prose, no json here, no braces'])
    expect(r.combined).toBe('')
  })

  it('produces no output when there is no text field', () => {
    const r = feed(['{"motionId":"wave","vocabulary":[]}'])
    expect(r.combined).toBe('')
  })

  it('skips nested object values and still finds text', () => {
    const r = feed([
      '{"meta":{"a":1,"b":[1,2,3]},"text":"after nested","x":"y"}',
    ])
    expect(r.combined).toBe('after nested')
  })

  it('does not pick up fake text key inside another string', () => {
    const r = feed([
      '{"hint":"the field named \\"text\\" is special","text":"real"}',
    ])
    expect(r.combined).toBe('real')
  })

  it('tolerates whitespace around colon and value', () => {
    const r = feed(['{ "text" : "spaced" }'])
    expect(r.combined).toBe('spaced')
  })

  it('works char-by-char', () => {
    const full = '{"motionId":"wave","text":"hello world"}'
    const r = feed(full.split(''))
    expect(r.combined).toBe('hello world')
  })

  it('emits partial text across multiple pushes', () => {
    const ex = new JsonTextStreamExtractor()
    const a = ex.push('{"text":"part1 ')
    const b = ex.push('part2 ')
    const c = ex.push('part3"}')
    expect(a).toBe('part1 ')
    expect(b).toBe('part2 ')
    expect(c).toBe('part3')
  })

  it('ignores stray braces in reasoning prose', () => {
    const r = feed(['让我想想 {这里是思考片段} 用户在问候', '{"text":"Hi!"}'])
    expect(r.combined).toBe('Hi!')
  })

  it('recovers from think tags containing braces', () => {
    const r = feed(['<think>let me think {step 1} and {step 2}</think>', '{"text":"answer"}'])
    expect(r.combined).toBe('answer')
  })
})
