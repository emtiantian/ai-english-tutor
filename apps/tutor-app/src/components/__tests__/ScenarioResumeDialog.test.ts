import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ScenarioResumeDialog from '../ScenarioResumeDialog.vue'
import type { ScenarioPausedSnapshot } from '../../lib/scenario-paused-db'

describe('ScenarioResumeDialog', () => {
  const scenario = {
    id: 'restaurant-ordering',
    name: '餐厅点餐',
    nameEn: 'Restaurant Ordering',
    icon: '🍽️'
  }
  const snapshot: ScenarioPausedSnapshot = {
    scenarioId: 'restaurant-ordering',
    level: 'A2',
    turnsCount: 8,
    maxTurns: 20,
    wordsUsed: ['coffee', 'tea', 'water'],
    targetWords: Array.from({ length: 30 }, (_, i) => `word-${i}`),
    serverSessionId: 'sess-123',
    savedAt: Date.now(),
    expiresAt: Date.now() + 12 * 60 * 60 * 1000
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  function mountComponent() {
    return mount(ScenarioResumeDialog, {
      props: { scenario, snapshot }
    })
  }

  it('渲染场景名称与图标', () => {
    const wrapper = mountComponent()
    expect(wrapper.find('.scenario-name').text()).toBe('餐厅点餐')
    expect(wrapper.find('.scenario-icon').text()).toBe('🍽️')
  })

  it('渲染暂停统计信息', () => {
    const wrapper = mountComponent()
    const rows = wrapper.findAll('.stat-row')
    const texts = rows.map(r => r.text())
    expect(texts.some(t => t.includes('A2'))).toBe(true)
    expect(texts.some(t => t.includes('8 / 20'))).toBe(true)
    expect(texts.some(t => t.includes('10%'))).toBe(true)
    expect(texts.some(t => t.includes('小时'))).toBe(true)
  })

  it('点击「继续练习」发出 resume 事件', async () => {
    const wrapper = mountComponent()
    await wrapper.find('.btn-resume').trigger('click')
    expect(wrapper.emitted('resume')).toHaveLength(1)
  })

  it('点击「重新开始」发出 restart 事件', async () => {
    const wrapper = mountComponent()
    await wrapper.find('.btn-restart').trigger('click')
    expect(wrapper.emitted('restart')).toHaveLength(1)
  })

  it('点击「取消」发出 cancel 事件', async () => {
    const wrapper = mountComponent()
    await wrapper.find('.btn-cancel').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('点击遮罩层发出 cancel 事件', async () => {
    const wrapper = mountComponent()
    await wrapper.find('.resume-dialog-overlay').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })
})
