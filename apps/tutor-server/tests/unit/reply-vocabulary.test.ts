import { describe, expect, it } from 'vitest'
import { ensureReplyVocabulary } from '../../src/ai/response/response-orchestrator.js'

describe('ensureReplyVocabulary', () => {
  it('recovers target words present in the reply when metadata is empty', () => {
    const result = ensureReplyVocabulary(
      { text: 'Please take a seat near the window.', vocabulary: [] },
      ['seat', 'window', 'menu']
    )
    expect(result.vocabulary).toEqual(['seat', 'window'])
  })

  it('does not duplicate model supplied words', () => {
    const result = ensureReplyVocabulary({ text: 'The menu is ready.', vocabulary: ['menu'] }, [
      'menu'
    ])
    expect(result.vocabulary).toEqual(['menu'])
  })
})
