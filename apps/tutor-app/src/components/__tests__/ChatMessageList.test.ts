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

  it('shows replay and chinese buttons for completed assistant messages without audioBase64', () => {
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
    expect(buttons).toHaveLength(2)
    expect(buttons[0].attributes('title')).toBe('重听英文')
    expect(buttons[1].attributes('title')).toBe('中文翻译')
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

  it('emits replay-chinese event with message id when chinese button clicked', async () => {
    const wrapper = mountComponent({
      messages: [
        {
          id: 'msg-xyz',
          role: 'assistant',
          text: 'Hello!',
          isStreaming: false,
          timestamp: Date.now(),
        },
      ],
    })

    await wrapper.find('.replay-btn[title="中文翻译"]').trigger('click')
    expect(wrapper.emitted('replay-chinese')).toHaveLength(1)
    expect(wrapper.emitted('replay-chinese')![0]).toEqual(['msg-xyz'])
  })

  it('disables buttons while audio is playing', () => {
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
      isPlaying: true,
    })

    const buttons = wrapper.findAll('.replay-btn')
    for (const btn of buttons) {
      expect(btn.attributes('disabled')).toBeDefined()
    }
  })
})
