import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ChatMessageList from '../ChatMessageList.vue'
import type { ChatMessage } from '../../stores/tutor'

describe('ChatMessageList', () => {
  const mountComponent = (props: { messages: ChatMessage[]; isPlaying?: boolean }) =>
    mount(ChatMessageList, {
      props: {
        messages: props.messages,
        isPlaying: props.isPlaying ?? false,
      },
    })

  it('shows only the english replay button when assistant message has no Chinese translation', () => {
    const wrapper = mountComponent({
      messages: [
        {
          id: 'msg-1',
          role: 'assistant',
          text: 'Hello!',
          isStreaming: false,
          timestamp: Date.now(),
        },
      ],
    })

    const buttons = wrapper.findAll('.replay-btn')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].attributes('title')).toBe('重听英文')
  })

  it('shows the 中 toggle button when assistant message has a Chinese translation', () => {
    const wrapper = mountComponent({
      messages: [
        {
          id: 'msg-1',
          role: 'assistant',
          text: 'Hello!',
          textZh: '你好！',
          isStreaming: false,
          timestamp: Date.now(),
        },
      ],
    })

    const buttons = wrapper.findAll('.replay-btn')
    expect(buttons).toHaveLength(2)
    expect(buttons[0].attributes('title')).toBe('重听英文')
    expect(buttons[1].attributes('title')).toBe('显示中文翻译')
  })

  it('hides replay buttons while assistant message is streaming', () => {
    const wrapper = mountComponent({
      messages: [
        {
          id: 'msg-1',
          role: 'assistant',
          text: 'Hello',
          isStreaming: true,
          timestamp: Date.now(),
        },
      ],
    })

    expect(wrapper.find('.replay-group').exists()).toBe(false)
  })

  it('does not show replay buttons for user messages', () => {
    const wrapper = mountComponent({
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          text: 'Hi',
          timestamp: Date.now(),
        },
      ],
    })

    expect(wrapper.find('.replay-group').exists()).toBe(false)
  })

  it('emits replay event with message id when english replay button clicked', async () => {
    const wrapper = mountComponent({
      messages: [
        {
          id: 'msg-abc',
          role: 'assistant',
          text: 'Hello!',
          isStreaming: false,
          timestamp: Date.now(),
        },
      ],
    })

    await wrapper.find('.replay-btn[title="重听英文"]').trigger('click')
    expect(wrapper.emitted('replay')).toHaveLength(1)
    expect(wrapper.emitted('replay')![0]).toEqual(['msg-abc'])
  })

  it('toggles the Chinese translation below the English text when 中 button clicked', async () => {
    const wrapper = mountComponent({
      messages: [
        {
          id: 'msg-xyz',
          role: 'assistant',
          text: 'Hello!',
          textZh: '你好！',
          isStreaming: false,
          timestamp: Date.now(),
        },
      ],
    })

    // Initially hidden
    expect(wrapper.find('.zh-translation').exists()).toBe(false)

    // Click to show
    await wrapper.find('.replay-btn--zh').trigger('click')
    expect(wrapper.find('.zh-translation').exists()).toBe(true)
    expect(wrapper.find('.zh-translation').text()).toBe('你好！')
    expect(wrapper.find('.replay-btn--zh').attributes('title')).toBe('隐藏中文')
    // No voice playback is triggered
    expect(wrapper.emitted('replay-chinese')).toBeUndefined()

    // Click again to hide
    await wrapper.find('.replay-btn--zh').trigger('click')
    expect(wrapper.find('.zh-translation').exists()).toBe(false)
  })

  it('keeps the 中 toggle button enabled while audio is playing', () => {
    const wrapper = mountComponent({
      messages: [
        {
          id: 'msg-1',
          role: 'assistant',
          text: 'Hello!',
          textZh: '你好！',
          isStreaming: false,
          timestamp: Date.now(),
        },
      ],
      isPlaying: true,
    })

    // English replay button is disabled during playback...
    expect(wrapper.find('.replay-btn[title="重听英文"]').attributes('disabled')).toBeDefined()
    // ...but the Chinese text toggle stays usable (it no longer plays audio).
    expect(wrapper.find('.replay-btn--zh').attributes('disabled')).toBeUndefined()
  })
})
