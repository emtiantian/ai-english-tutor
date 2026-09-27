import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import LoginRequiredModal from '../../src/components/LoginRequiredModal.vue'

describe('LoginRequiredModal', () => {
  it('展示游客额度并明确标记登录尚未开放', async () => {
    const wrapper = mount(LoginRequiredModal, { props: { limit: 5 } })

    expect(wrapper.get('[role="dialog"]').attributes('aria-modal')).toBe('true')
    expect(wrapper.text()).toContain('你已完成 5 轮免费英语练习')
    expect(wrapper.get('button[disabled]').text()).toBe('登录功能即将开放')

    const buttons = wrapper.findAll('button')
    await buttons.at(-1)?.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
