import { pickBestStudentHint } from '../../src/utils/hint-picker.js'

describe('pickBestStudentHint', () => {
  it('returns undefined for empty candidates', () => {
    expect(pickBestStudentHint([])).toBeUndefined()
  })

  it('returns the first candidate without options', () => {
    expect(pickBestStudentHint(['Hello', 'Hi'])).toBe('Hello')
  })

  it('prefers an unlearned target word', () => {
    const candidates = ['I need help', 'I would like a ticket']
    const result = pickBestStudentHint(candidates, {
      targetWords: ['ticket', 'help'],
      wordsLearned: ['help']
    })
    expect(result).toBe('I would like a ticket')
  })

  it('falls back to any target word', () => {
    const candidates = ['I need help', 'Thank you']
    const result = pickBestStudentHint(candidates, {
      targetWords: ['help'],
      wordsLearned: ['help']
    })
    expect(result).toBe('I need help')
  })

  it('falls back to the first candidate', () => {
    const candidates = ['Thank you', 'Goodbye']
    const result = pickBestStudentHint(candidates, { targetWords: ['ticket'] })
    expect(result).toBe('Thank you')
  })
})
