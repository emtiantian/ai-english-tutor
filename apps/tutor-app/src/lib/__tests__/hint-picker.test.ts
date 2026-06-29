import { describe, it, expect } from 'vitest'
import { pickBestStudentHint } from '../hint-picker'

describe('pickBestStudentHint', () => {
  it('空数组返回 undefined', () => {
    expect(pickBestStudentHint([])).toBeUndefined()
  })

  it('无目标词时返回第一条候选', () => {
    expect(pickBestStudentHint(['Hello', 'Hi'])).toBe('Hello')
  })

  it('优先选择包含未掌握目标词的候选', () => {
    const candidates = [
      'Coffee was great, thanks.',
      'Could I have some tea, please?',
    ]
    const result = pickBestStudentHint(candidates, {
      targetWords: ['coffee', 'tea', 'please'],
      wordsLearned: ['coffee'],
    })
    expect(result).toBe('Could I have some tea, please?')
  })

  it('没有未掌握词时退而选择包含任意目标词的候选', () => {
    const candidates = ['Good morning.', 'I would like a coffee.']
    const result = pickBestStudentHint(candidates, {
      targetWords: ['coffee', 'tea'],
      wordsLearned: ['coffee', 'tea'],
    })
    expect(result).toBe('I would like a coffee.')
  })

  it('大小写不敏感', () => {
    const candidates = ['Could I have a COFFEE, please?']
    const result = pickBestStudentHint(candidates, {
      targetWords: ['coffee'],
      wordsLearned: [],
    })
    expect(result).toBe('Could I have a COFFEE, please?')
  })

  it('wordsLearned 大小写不敏感', () => {
    const candidates = ['Tea please.', 'Coffee please.']
    const result = pickBestStudentHint(candidates, {
      targetWords: ['coffee', 'tea'],
      wordsLearned: ['TEA'],
    })
    expect(result).toBe('Coffee please.')
  })
})
