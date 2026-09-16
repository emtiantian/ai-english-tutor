import { describe, expect, it } from 'vitest'
import { ensureReplyVocabulary } from '../../src/ai/response/reply-vocabulary.js'

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

  it('只保留目标池中且在回复正文实际出现的词', () => {
    const result = ensureReplyVocabulary(
      {
        text: 'The menu is ready.',
        vocabulary: ['airport', 'window', 'menu'],
        vocabularySentences: ['Airport example.', 'Window example.', 'Menu example.']
      },
      ['menu', 'window']
    )
    expect(result.vocabulary).toEqual(['menu'])
    expect(result.vocabularySentences).toEqual(['Menu example.'])
  })

  it('默认每轮最多标注 3 个词', () => {
    const result = ensureReplyVocabulary(
      { text: 'The menu, window, payment, and receipt are ready.', vocabulary: [] },
      ['menu', 'window', 'payment', 'receipt']
    )
    expect(result.vocabulary).toEqual(['menu', 'window', 'payment'])
  })

  it('补回遗漏词后清除不完整的例句映射，避免词与例句错位', () => {
    const result = ensureReplyVocabulary(
      {
        text: 'The menu is beside the window.',
        vocabulary: ['menu'],
        vocabularySentences: ['Here is the menu.']
      },
      ['menu', 'window']
    )
    expect(result.vocabulary).toEqual(['menu', 'window'])
    expect(result.vocabularySentences).toBeUndefined()
  })

  it('允许调用方替换单轮标注上限', () => {
    const result = ensureReplyVocabulary(
      { text: 'The menu and receipt are ready.', vocabulary: [] },
      ['menu', 'receipt'],
      1
    )
    expect(result.vocabulary).toEqual(['menu'])
  })
})
