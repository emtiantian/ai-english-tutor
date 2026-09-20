import { describe, expect, it } from 'vitest'
import { ensureReplyVocabulary } from '../../src/ai/response/reply-vocabulary.js'

describe('ensureReplyVocabulary', () => {
  it('keeps model-selected words and phrases that occur in the reply', () => {
    const result = ensureReplyVocabulary({
      text: 'The seafood platter is our most sought-after dish.',
      vocabulary: ['seafood platter', 'sought-after']
    })
    expect(result.vocabulary).toEqual(['seafood platter', 'sought-after'])
  })

  it('drops candidates that do not occur verbatim', () => {
    const result = ensureReplyVocabulary({
      text: 'The menu is ready.',
      vocabulary: ['airport', 'menu', 'ready']
    })
    expect(result.vocabulary).toEqual(['menu', 'ready'])
  })

  it('does not repeat terms already annotated in this session', () => {
    const result = ensureReplyVocabulary(
      {
        text: 'This flavorful dish is quite popular.',
        vocabulary: ['flavorful', 'popular']
      },
      ['flavorful']
    )
    expect(result.vocabulary).toEqual(['popular'])
  })

  it('limits annotations to three', () => {
    const result = ensureReplyVocabulary({
      text: 'The flavorful, seasonal, locally sourced dish is complimentary.',
      vocabulary: ['flavorful', 'seasonal', 'locally sourced', 'complimentary']
    })
    expect(result.vocabulary).toEqual(['flavorful', 'seasonal', 'locally sourced'])
  })

  it('returns empty arrays when the model finds no worthwhile vocabulary', () => {
    const result = ensureReplyVocabulary({
      text: 'Yes, of course.',
      vocabulary: []
    })
    expect(result.vocabulary).toEqual([])
  })
})
