import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ScenarioStatusStrip from '../ScenarioStatusStrip.vue'

describe('ScenarioStatusStrip', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  function mountComponent(props?: Record<string, unknown>) {
    return mount(ScenarioStatusStrip, {
      props: {
        level: 'A2',
        turnsCount: 8,
        maxTurns: 20,
        wordsLearned: ['coffee', 'tea'],
        targetWordsTotal: 30,
        coverageRate: 0.18,
        ...props,
      },
    })
  }

  it('渲染三段进度：等级 / 轮次 / 覆盖率+词数', () => {
    const wrapper = mountComponent()
    const text = wrapper.text()
    expect(text).toContain('A2')
    expect(text).toContain('8 / 20 轮')
    expect(text).toContain('18%')
    expect(text).toContain('2 / 30 词')
  })

  it('无 coverageRate 时根据 wordsLearned / targetWordsTotal 计算', () => {
    const wrapper = mountComponent({ coverageRate: undefined, wordsLearned: ['a', 'b', 'c'], targetWordsTotal: 10 })
    expect(wrapper.text()).toContain('30%')
  })

  it('点击「目标词」按钮发出 show-target-words 事件', async () => {
    const wrapper = mountComponent()
    await wrapper.find('.status-btn').trigger('click')
    expect(wrapper.emitted('show-target-words')).toHaveLength(1)
  })

  it('点击「换场景」按钮发出 switch-scenario 事件', async () => {
    const wrapper = mountComponent()
    const buttons = wrapper.findAll('.status-btn')
    await buttons[buttons.length - 1].trigger('click')
    expect(wrapper.emitted('switch-scenario')).toHaveLength(1)
  })
})
