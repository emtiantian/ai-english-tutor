import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import TargetWordsPanel from '../TargetWordsPanel.vue'

describe('TargetWordsPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  function mountComponent(props?: Record<string, unknown>) {
    return mount(TargetWordsPanel, {
      props: {
        targetWords: ['coffee', 'tea', 'water', 'bread'],
        wordsLearned: ['coffee', 'tea'],
        level: 'A2',
        ...props
      }
    })
  }

  it('渲染所有目标词与已掌握状态', () => {
    const wrapper = mountComponent()
    const chips = wrapper.findAll('.word-chip')
    expect(chips).toHaveLength(4)
    expect(chips[0].classes()).toContain('learned')
    expect(chips[2].classes()).not.toContain('learned')
  })

  it('渲染等级徽章与覆盖率统计', () => {
    const wrapper = mountComponent()
    expect(wrapper.find('.level-badge').text()).toBe('A2')
    expect(wrapper.text()).toContain('已掌握 2 / 4')
    expect(wrapper.text()).toContain('覆盖率 50%')
  })

  it('点击关闭按钮发出 close 事件', async () => {
    const wrapper = mountComponent()
    await wrapper.find('.close-btn').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('点击遮罩层发出 close 事件', async () => {
    const wrapper = mountComponent()
    await wrapper.find('.target-words-overlay').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
