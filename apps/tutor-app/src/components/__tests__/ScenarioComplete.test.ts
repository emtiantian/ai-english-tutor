import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ScenarioComplete from '../ScenarioComplete.vue'
import type { ScenarioProgress } from '../../client/types'

describe('ScenarioComplete', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  function makeScenario(overrides: Partial<ScenarioProgress> = {}): ScenarioProgress {
    return {
      id: 'restaurant-ordering',
      name: '餐厅点餐',
      icon: '🍽️',
      targetWords: ['coffee', 'tea', 'water', 'bread'],
      targetWordsTotal: 4,
      wordsLearned: ['coffee', 'tea'],
      level: 'A2',
      turnsCount: 8,
      maxTurns: 20,
      coverageRate: 0.5,
      stars: 3,
      completed: true,
      ...overrides,
    }
  }

  function mountComponent(props?: Record<string, unknown>) {
    return mount(ScenarioComplete, {
      props: {
        scenario: makeScenario(),
        ...props,
      },
    })
  }

  it('3 星显示 3 颗点亮星 + 2 颗暗星', () => {
    const wrapper = mountComponent()
    const stars = wrapper.findAll('.star')
    expect(stars).toHaveLength(5)
    expect(stars.filter((s) => s.classes().includes('filled')).length).toBe(3)
    expect(stars.filter((s) => s.classes().includes('empty')).length).toBe(2)
  })

  it('0 星显示 0 颗点亮星（重试态）', () => {
    const wrapper = mountComponent({ scenario: makeScenario({ stars: 0 }) })
    expect(wrapper.findAll('.star.filled')).toHaveLength(0)
    expect(wrapper.find('.btn-retry').exists()).toBe(true)
    expect(wrapper.find('.btn-challenge').exists()).toBe(false)
  })

  it('达标且未封顶显示「挑战下一档」', () => {
    const wrapper = mountComponent({ scenario: makeScenario({ stars: 4 }) })
    expect(wrapper.find('.btn-challenge').exists()).toBe(true)
    expect(wrapper.find('.btn-retry').exists()).toBe(false)
    expect(wrapper.find('.btn-capped').exists()).toBe(false)
  })

  it('isCapped=true 时显示「已封顶」', () => {
    const wrapper = mountComponent({ scenario: makeScenario({ stars: 5 }), isCapped: true })
    expect(wrapper.find('.btn-capped').exists()).toBe(true)
    expect(wrapper.find('.btn-challenge').exists()).toBe(false)
  })

  it('点击「重试当前档」发出 retry 事件', async () => {
    const wrapper = mountComponent({ scenario: makeScenario({ stars: 0 }) })
    await wrapper.find('.btn-retry').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('点击「挑战下一档」发出 challenge 事件', async () => {
    const wrapper = mountComponent({ scenario: makeScenario({ stars: 4 }) })
    await wrapper.find('.btn-challenge').trigger('click')
    expect(wrapper.emitted('challenge')).toHaveLength(1)
  })

  it('点击「返回场景列表」发出 next 事件', async () => {
    const wrapper = mountComponent()
    await wrapper.find('.btn-next').trigger('click')
    expect(wrapper.emitted('next')).toHaveLength(1)
  })
})
