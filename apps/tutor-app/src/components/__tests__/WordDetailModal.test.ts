import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WordDetailModal from '../WordDetailModal.vue'
import type { WordExplanation } from '../../client/types'

const sampleExplanation: WordExplanation = {
  word: 'abandon',
  phonetic: 'əˈbændən',
  level: 'B2',
  senses: [
    { pos: 'v.', meaningZh: '放弃；抛弃', exampleEn: 'They abandoned the plan.', exampleZh: '他们放弃了计划。' },
  ],
  synonyms: ['desert', 'forsake'],
  usageNoteZh: '常用于 abandon sth 结构。',
}

describe('WordDetailModal', () => {
  it('renders the word, phonetic, level, senses and synonyms', () => {
    const wrapper = mount(WordDetailModal, {
      props: { word: 'abandon', explanation: sampleExplanation, loading: false, error: null },
    })

    expect(wrapper.find('.word-modal-word').text()).toBe('abandon')
    expect(wrapper.find('.word-modal-phonetic').text()).toContain('əˈbændən')
    expect(wrapper.find('.word-modal-level').text()).toBe('B2')
    expect(wrapper.find('.word-sense-meaning').text()).toBe('放弃；抛弃')
    expect(wrapper.find('.word-sense-example-en').text()).toBe('They abandoned the plan.')
    expect(wrapper.findAll('.word-synonym-chip')).toHaveLength(2)
  })

  it('shows loading skeletons and no content while loading', () => {
    const wrapper = mount(WordDetailModal, {
      props: { word: 'abandon', explanation: null, loading: true, error: null },
    })
    expect(wrapper.find('.word-skeleton').exists()).toBe(true)
    expect(wrapper.find('.word-sense').exists()).toBe(false)
  })

  it('shows the error fallback message', () => {
    const wrapper = mount(WordDetailModal, {
      props: { word: 'abandon', explanation: null, loading: false, error: '离线或查询失败，请稍后再试。' },
    })
    expect(wrapper.find('.word-modal-error').text()).toBe('离线或查询失败，请稍后再试。')
  })

  it('emits speak when the speaker button is clicked', async () => {
    const wrapper = mount(WordDetailModal, {
      props: { word: 'abandon', explanation: sampleExplanation, loading: false, error: null },
    })
    await wrapper.find('.word-modal-speak').trigger('click')
    expect(wrapper.emitted('speak')).toHaveLength(1)
  })

  it('emits close when the overlay or close button is clicked', async () => {
    const wrapper = mount(WordDetailModal, {
      props: { word: 'abandon', explanation: sampleExplanation, loading: false, error: null },
    })
    await wrapper.find('.word-modal-close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)

    await wrapper.find('.word-modal-overlay').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(2)
  })
})
