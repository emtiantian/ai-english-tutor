import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import ChatInputBar from '../ChatInputBar.vue'

describe('ChatInputBar', () => {
  const DEFAULT_PROPS = {
    isRecording: false,
    isEncoding: false,
    recordingDuration: 0,
  }

  const mountComponent = (props?: Record<string, unknown>) =>
    mount(ChatInputBar, {
      attachTo: document.body,
      props: {
        ...DEFAULT_PROPS,
        ...props,
      },
    })

  beforeEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('默认显示语音模式', () => {
    const wrapper = mountComponent()

    expect(wrapper.find('.voice-talk-btn').exists()).toBe(true)
    expect(wrapper.find('.input-pill').exists()).toBe(false)
  })

  it('点击左侧切换图标切换到键盘模式', async () => {
    const wrapper = mountComponent()

    await wrapper.find('.mode-toggle-btn').trigger('click')

    expect(wrapper.find('.input-pill').exists()).toBe(true)
    expect(wrapper.find('.voice-talk-btn').exists()).toBe(false)
  })

  it('键盘模式下点击发送按钮触发 send-text', async () => {
    const wrapper = mountComponent()

    await wrapper.find('.mode-toggle-btn').trigger('click')
    const input = wrapper.find('.input-pill')
    await input.setValue('Hello world')

    await wrapper.find('.btn-primary').trigger('click')

    expect(wrapper.emitted('send-text')).toHaveLength(1)
    expect(wrapper.emitted('send-text')![0]).toEqual(['Hello world'])
  })

  it('输入为空时发送按钮禁用', async () => {
    const wrapper = mountComponent()

    await wrapper.find('.mode-toggle-btn').trigger('click')

    const btn = wrapper.find('.btn-primary')
    expect(btn.attributes('disabled')).toBeDefined()

    await wrapper.find('.input-pill').setValue('  ')
    expect(wrapper.find('.btn-primary').attributes('disabled')).toBeDefined()
  })

  it('按住语音按钮触发 record-start', async () => {
    const wrapper = mountComponent()

    await wrapper.find('.voice-talk-btn').trigger('mousedown')

    expect(wrapper.emitted('record-start')).toHaveLength(1)
  })

  it('松开语音按钮触发 record-stop', async () => {
    const wrapper = mountComponent()

    await wrapper.find('.voice-talk-btn').trigger('mousedown')
    await wrapper.find('.voice-talk-btn').trigger('mouseup')

    expect(wrapper.emitted('record-stop')).toHaveLength(1)
  })

  it('鼠标离开语音按钮触发 record-cancel', async () => {
    const wrapper = mountComponent()

    await wrapper.find('.voice-talk-btn').trigger('mousedown')
    await wrapper.find('.voice-talk-btn').trigger('mouseleave')

    expect(wrapper.emitted('record-cancel')).toHaveLength(1)
  })

  it('上滑超过阈值后松开触发 record-cancel', async () => {
    const wrapper = mountComponent()
    const btn = wrapper.find('.voice-talk-btn')

    await btn.trigger('mousedown', { clientY: 200 })
    await btn.trigger('mousemove', { clientY: 100 })
    await btn.trigger('mouseup')

    expect(wrapper.emitted('record-cancel')).toHaveLength(1)
    expect(wrapper.emitted('record-stop')).toBeUndefined()
  })

  it('上滑未超过阈值后松开触发 record-stop', async () => {
    const wrapper = mountComponent()
    const btn = wrapper.find('.voice-talk-btn')

    await btn.trigger('mousedown', { clientY: 200 })
    await btn.trigger('mousemove', { clientY: 150 })
    await btn.trigger('mouseup')

    expect(wrapper.emitted('record-stop')).toHaveLength(1)
    expect(wrapper.emitted('record-cancel')).toBeUndefined()
  })

  it('录音中显示录音浮层', async () => {
    const wrapper = mountComponent()

    await wrapper.find('.voice-talk-btn').trigger('mousedown')
    await nextTick()

    expect(document.body.querySelector('.recording-overlay')).not.toBeNull()
  })

  it('上滑取消时浮层显示取消文案', async () => {
    const wrapper = mountComponent()
    const btn = wrapper.find('.voice-talk-btn')

    await btn.trigger('mousedown', { clientY: 200 })
    await btn.trigger('mousemove', { clientY: 100 })
    await nextTick()

    const overlay = document.body.querySelector('.recording-overlay')
    expect(overlay).not.toBeNull()
    expect(overlay?.classList.contains('cancelled')).toBe(true)
    expect(overlay?.textContent).toContain('松开 取消发送')
  })

  it('touchstart 在语音按钮上触发 record-start', async () => {
    const wrapper = mountComponent()
    const btn = wrapper.find('.voice-talk-btn')

    await btn.trigger('touchstart', { touches: [{ clientY: 200 }] })

    expect(wrapper.emitted('record-start')).toHaveLength(1)
  })

  it('touchend 在 touchstart 后触发 record-stop', async () => {
    const wrapper = mountComponent()
    const btn = wrapper.find('.voice-talk-btn')

    await btn.trigger('touchstart', { touches: [{ clientY: 200 }] })
    await btn.trigger('touchend', { changedTouches: [{ clientY: 200 }] })

    expect(wrapper.emitted('record-stop')).toHaveLength(1)
  })

  it('isEncoding 为 true 时语音按钮禁用且点击不触发 record-start', async () => {
    const wrapper = mountComponent({ isEncoding: true })
    const btn = wrapper.find('.voice-talk-btn')

    expect(btn.attributes('disabled')).toBeDefined()

    await btn.trigger('mousedown')
    expect(wrapper.emitted('record-start')).toBeUndefined()

    await btn.trigger('touchstart', { touches: [{ clientY: 200 }] })
    expect(wrapper.emitted('record-start')).toBeUndefined()
  })

  it('仅空白字符输入时按 Enter 或点击发送不触发 send-text', async () => {
    const wrapper = mountComponent()

    await wrapper.find('.mode-toggle-btn').trigger('click')
    const input = wrapper.find('.input-pill')

    // 仅空格
    await input.setValue('   ')
    await input.trigger('keydown.enter')
    expect(wrapper.emitted('send-text')).toBeUndefined()

    await wrapper.find('.btn-primary').trigger('click')
    expect(wrapper.emitted('send-text')).toBeUndefined()

    // 换行 + 空格
    await input.setValue('  \n  ')
    await input.trigger('keydown.enter')
    expect(wrapper.emitted('send-text')).toBeUndefined()
  })

  it('未录音时 mouseleave 不触发 record-cancel', async () => {
    const wrapper = mountComponent()
    const btn = wrapper.find('.voice-talk-btn')

    // 不触发 mousedown，直接 mouseleave
    await btn.trigger('mouseleave')

    expect(wrapper.emitted('record-cancel')).toBeUndefined()
  })

  it('recordError 显示提示并清空', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const wrapper = mountComponent()

    await wrapper.setProps({ recordError: '录音权限被拒绝' })
    await nextTick()

    expect(alertSpy).toHaveBeenCalledWith('录音权限被拒绝')
    expect(wrapper.emitted('update:record-error')).toHaveLength(1)
    expect(wrapper.emitted('update:record-error')![0]).toEqual([null])

    alertSpy.mockRestore()
  })

  describe('💡 suggested phrase', () => {
    const SCENARIO = {
      id: 'restaurant-ordering',
      name: '餐厅点餐',
      icon: '🍽️',
      targetWords: ['coffee', 'tea', 'please'],
      targetWordsTotal: 3,
      wordsLearned: [],
    }

    it('显示传入的 suggestedPhrase', () => {
      const wrapper = mountComponent({
        scenario: SCENARIO,
        suggestedPhrase: 'Hi, could I have a coffee please?',
      })

      const hint = wrapper.find('.suggested-phrase')
      expect(hint.exists()).toBe(true)
      expect(hint.text()).toContain('Hi, could I have a coffee please?')
    })

    it('没有 suggestedPhrase 时不显示提示', () => {
      const wrapper = mountComponent({ scenario: SCENARIO })
      expect(wrapper.find('.suggested-phrase').exists()).toBe(false)
    })
  })

  it('传入 scenario 时渲染 ScenarioStatusStrip', () => {
    const wrapper = mountComponent({
      scenario: {
        id: 'restaurant-ordering',
        name: '餐厅点餐',
        icon: '🍽️',
        targetWords: ['coffee', 'tea', 'water'],
        targetWordsTotal: 30,
        wordsLearned: ['coffee'],
        level: 'A2',
        turnsCount: 8,
        maxTurns: 20,
        coverageRate: 0.2,
      },
    })

    expect(wrapper.findComponent({ name: 'ScenarioStatusStrip' }).exists()).toBe(true)
  })

  it('点击「目标词」按钮打开目标词抽屉', async () => {
    const wrapper = mountComponent({
      scenario: {
        id: 'restaurant-ordering',
        name: '餐厅点餐',
        icon: '🍽️',
        targetWords: ['coffee', 'tea', 'water'],
        targetWordsTotal: 30,
        wordsLearned: ['coffee'],
        level: 'A2',
        turnsCount: 8,
        maxTurns: 20,
        coverageRate: 0.2,
      },
    })

    const strip = wrapper.findComponent({ name: 'ScenarioStatusStrip' })
    await strip.vm.$emit('show-target-words')
    await nextTick()

    expect(wrapper.findComponent({ name: 'TargetWordsPanel' }).exists()).toBe(true)
  })

  it('点击「换场景」并确认后发出 switch-scenario 事件', async () => {
    const wrapper = mountComponent({
      scenario: {
        id: 'restaurant-ordering',
        name: '餐厅点餐',
        icon: '🍽️',
        targetWords: ['coffee', 'tea', 'water'],
        targetWordsTotal: 30,
        wordsLearned: ['coffee'],
        level: 'A2',
        turnsCount: 8,
        maxTurns: 20,
        coverageRate: 0.2,
      },
    })

    const strip = wrapper.findComponent({ name: 'ScenarioStatusStrip' })
    await strip.vm.$emit('switch-scenario')
    await nextTick()

    const confirm = wrapper.findComponent({ name: 'SwitchScenarioConfirm' })
    expect(confirm.exists()).toBe(true)

    await confirm.vm.$emit('confirm')
    expect(wrapper.emitted('switch-scenario')).toHaveLength(1)
  })
})
