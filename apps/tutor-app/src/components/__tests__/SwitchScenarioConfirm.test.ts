import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import SwitchScenarioConfirm from '../SwitchScenarioConfirm.vue'

describe('SwitchScenarioConfirm', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  function mountComponent(props?: Record<string, unknown>) {
    return mount(SwitchScenarioConfirm, {
      props: {
        turnsCount: 8,
        minTurnsForPause: 6,
        ...props,
      },
    })
  }

  it('≥ 最小轮次时显示保存进度提示', () => {
    const wrapper = mountComponent()
    expect(wrapper.text()).toContain('保存进度')
    expect(wrapper.text()).toContain('24 小时')
  })

  it('< 最小轮次时显示放弃进度提示', () => {
    const wrapper = mountComponent({ turnsCount: 3 })
    expect(wrapper.text()).toContain('放弃本次进度')
  })

  it('点击「确认切换」发出 confirm 事件', async () => {
    const wrapper = mountComponent()
    await wrapper.find('.btn-confirm').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('点击「取消」与遮罩层发出 cancel 事件', async () => {
    const wrapper = mountComponent()
    await wrapper.find('.btn-cancel').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)

    await wrapper.find('.switch-confirm-overlay').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(2)
  })
})
