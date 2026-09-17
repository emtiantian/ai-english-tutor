import { describe, expect, it } from 'vitest'
import { ensureReplyVocabulary } from '../../src/ai/response/reply-vocabulary.js'

describe('ensureReplyVocabulary', () => {
  it('keeps model-selected words and phrases that occur in the reply', () => {
    const result = ensureReplyVocabulary({
      text: 'The seafood platter is our most sought-after dish.',
      vocabulary: ['seafood platter', 'sought-after'],
      vocabularySentences: ['We shared a seafood platter.', 'This is a sought-after reservation.']
    })
    expect(result.vocabulary).toEqual(['seafood platter', 'sought-after'])
    expect(result.vocabularySentences).toHaveLength(2)
  })

  it('drops candidates that do not occur verbatim or lack a matching example', () => {
    const result = ensureReplyVocabulary({
      text: 'The menu is ready.',
      vocabulary: ['airport', 'menu', 'ready'],
      vocabularySentences: ['Airport example.', 'Menu example.']
    })
    expect(result.vocabulary).toEqual(['menu'])
    expect(result.vocabularySentences).toEqual(['Menu example.'])
  })

  it('does not repeat terms already annotated in this session', () => {
    const result = ensureReplyVocabulary(
      {
        text: 'This flavorful dish is quite popular.',
        vocabulary: ['flavorful', 'popular'],
        vocabularySentences: ['The soup is flavorful.', 'It is a popular choice.']
      },
      ['flavorful']
    )
    expect(result.vocabulary).toEqual(['popular'])
  })

  it('limits annotations to three while preserving aligned examples', () => {
    const result = ensureReplyVocabulary({
      text: 'The flavorful, seasonal, locally sourced dish is complimentary.',
      vocabulary: ['flavorful', 'seasonal', 'locally sourced', 'complimentary'],
      vocabularySentences: ['One.', 'Two.', 'Three.', 'Four.']
    })
    expect(result.vocabulary).toEqual(['flavorful', 'seasonal', 'locally sourced'])
    expect(result.vocabularySentences).toEqual(['One.', 'Two.', 'Three.'])
  })

  it('returns empty arrays when the model finds no worthwhile vocabulary', () => {
    const result = ensureReplyVocabulary({
      text: 'Yes, of course.',
      vocabulary: [],
      vocabularySentences: []
    })
    expect(result.vocabulary).toEqual([])
    expect(result.vocabularySentences).toEqual([])
  })
})
