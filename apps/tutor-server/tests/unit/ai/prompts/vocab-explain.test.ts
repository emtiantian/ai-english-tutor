import { describe, it, expect } from 'vitest'
import { buildVocabExplainMessages } from '@/ai/prompts/vocab-explain.js'
import { parseVocabExplainResponse } from '@/ai/prompts/parsers/vocab-explain.js'

describe('vocab-explain prompt and parser', () => {
  it('buildVocabExplainMessages includes word, sentence and level hint', () => {
    const messages = buildVocabExplainMessages('abandon', 'They had to abandon the ship.', {
      level: 'B2',
      meaning: '放弃',
      pos: 'v.'
    })
    expect(messages.length).toBe(2)
    expect(messages[0].role).toBe('system')
    const userContent = String(messages[1].content)
    expect(userContent).toContain('abandon')
    expect(userContent).toContain('They had to abandon the ship.')
    expect(userContent).toContain('B2')
  })

  it('parses normal JSON response', () => {
    const normal = parseVocabExplainResponse(
      JSON.stringify({
        word: 'abandon',
        phonetic: '/əˈbændən/',
        senses: [
          {
            pos: 'v.',
            meaningZh: '放弃；抛弃',
            exampleEn: 'They abandoned the plan.',
            exampleZh: '他们放弃了这个计划。'
          }
        ],
        synonyms: ['desert', 'forsake'],
        usageNoteZh: '常用于 abandon sth/sb 结构。'
      }),
      'abandon'
    )
    expect(normal).not.toBeNull()
    expect(normal!.word).toBe('abandon')
    expect(normal!.phonetic).toBe('/əˈbændən/')
    expect(normal!.senses.length).toBe(1)
    expect(normal!.senses[0].meaningZh).toBe('放弃；抛弃')
    expect(normal!.synonyms).toEqual(['desert', 'forsake'])
  })

  it('parses code-fenced JSON', () => {
    const fenced = parseVocabExplainResponse(
      '```json\n' +
        JSON.stringify({ word: 'run', senses: [{ pos: 'v.', meaningZh: '跑' }] }) +
        '\n```',
      'run'
    )
    expect(fenced).not.toBeNull()
    expect(fenced!.senses[0].meaningZh).toBe('跑')
  })

  it('parses JSON with trailing prose', () => {
    const trailing = parseVocabExplainResponse(
      JSON.stringify({ word: 'book', senses: [{ pos: 'n.', meaningZh: '书' }] }) +
        '\n\n希望这个解释对你有帮助！',
      'book'
    )
    expect(trailing).not.toBeNull()
    expect(trailing!.word).toBe('book')
  })

  it('uses fallbackWord when word field is missing', () => {
    const noWord = parseVocabExplainResponse(
      JSON.stringify({ senses: [{ pos: 'adj.', meaningZh: '快乐的' }] }),
      'happy'
    )
    expect(noWord).not.toBeNull()
    expect(noWord!.word).toBe('happy')
  })

  it('returns null when senses are empty', () => {
    const empty = parseVocabExplainResponse(JSON.stringify({ word: 'x', senses: [] }), 'x')
    expect(empty).toBeNull()
  })

  it('returns null when senses lack meaningZh', () => {
    const sensesMissingMeaning = parseVocabExplainResponse(
      JSON.stringify({ word: 'x', senses: [{ pos: 'n.' }] }),
      'x'
    )
    expect(sensesMissingMeaning).toBeNull()
  })

  it('returns null for non-JSON input', () => {
    expect(parseVocabExplainResponse('sorry, I cannot help', 'x')).toBeNull()
  })
})
