import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ScenarioPicker from '../ScenarioPicker.vue'
import type { UserScenarioProgress } from '../../client/types'
import type { ScenarioPausedSnapshot } from '../../lib/scenario-paused-db'
import type { CEFRLevel } from '@ai-english-tutor/shared'

describe('ScenarioPicker', () => {
  const scenarios = [
    { id: 'restaurant-ordering', name: '餐厅点餐', nameEn: 'Restaurant Ordering', icon: '🍽️' },
    { id: 'shopping', name: '购物对话', nameEn: 'Shopping', icon: '🛒' },
  ]

  function mountComponent(props?: Record<string, unknown>) {
    return mount(ScenarioPicker, {
      props: {
        scenarios,
        userLevel: 'A1' as CEFRLevel,
        pausedSnapshots: new Map<string, ScenarioPausedSnapshot>(),
        userScenarioProgress: new Map<string, UserScenarioProgress>(),
        ...props,
      },
    })
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('渲染所有场景卡片', () => {
    const wrapper = mountComponent()
    const cards = wrapper.findAll('.scenario-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].find('.scenario-name').text()).toBe('餐厅点餐')
    expect(cards[0].find('.scenario-name-en').text()).toBe('Restaurant Ordering')
  })

  it('每个卡片底部有 A1-C2 六档进度点', () => {
    const wrapper = mountComponent()
    const firstCard = wrapper.findAll('.scenario-card')[0]
    const dots = firstCard.findAll('.level-dot-wrapper')
    expect(dots).toHaveLength(6)
    const labels = dots.map((d) => d.find('.level-label').text())
    expect(labels).toEqual(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])
  })

  it('未玩过场景显示「开始 A1」按钮', () => {
    const wrapper = mountComponent()
    const firstCard = wrapper.findAll('.scenario-card')[0]
    expect(firstCard.find('.enter-button').text()).toBe('开始 A1')
  })

  it('已通关 A1 的场景显示「挑战 A2」按钮', () => {
    const progress = new Map<string, UserScenarioProgress>()
    progress.set('restaurant-ordering', {
      scenarioId: 'restaurant-ordering',
      highestClearedLevel: 'A1',
      starsByLevel: { A1: 3 },
      attempts: 1,
      lastPlayedAt: Date.now(),
    })
    const wrapper = mountComponent({ userScenarioProgress: progress })
    const card = wrapper.findAll('.scenario-card')[0]
    expect(card.find('.enter-button').text()).toBe('挑战 A2')
  })

  it('已通关 C2 的场景显示「重玩 C2」按钮', () => {
    const progress = new Map<string, UserScenarioProgress>()
    progress.set('restaurant-ordering', {
      scenarioId: 'restaurant-ordering',
      highestClearedLevel: 'C2',
      starsByLevel: { A1: 3, A2: 4, B1: 3, B2: 4, C1: 5, C2: 5 },
      attempts: 12,
      lastPlayedAt: Date.now(),
    })
    const wrapper = mountComponent({ userScenarioProgress: progress })
    const card = wrapper.findAll('.scenario-card')[0]
    expect(card.find('.enter-button').text()).toBe('重玩 C2')
  })

  it('暂停场景显示「继续」徽章与按钮', () => {
    const snapshots = new Map<string, ScenarioPausedSnapshot>()
    snapshots.set('restaurant-ordering', {
      scenarioId: 'restaurant-ordering',
      level: 'A2',
      turnsCount: 8,
      maxTurns: 20,
      wordsUsed: ['coffee', 'tea'],
      targetWords: ['coffee', 'tea', 'water', 'bread'],
      serverSessionId: 'sess-123',
      savedAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    })
    const wrapper = mountComponent({ pausedSnapshots: snapshots })
    const card = wrapper.findAll('.scenario-card')[0]
    expect(card.find('.pause-badge').exists()).toBe(true)
    expect(card.find('.pause-badge').text()).toContain('可续玩')
    expect(card.find('.enter-button').text()).toBe('继续')
  })

  it('点击非暂停卡片的开始按钮发出 select 事件并携带 level', async () => {
    const wrapper = mountComponent()
    const card = wrapper.findAll('.scenario-card')[0]
    await card.find('.enter-button').trigger('click')
    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(wrapper.emitted('select')![0]).toEqual([
      'restaurant-ordering',
      { styleName: 'lazy-mature', level: 'A1' },
    ])
  })

  it('点击难度点后点击开始按钮可更换难度', async () => {
    const wrapper = mountComponent()
    const card = wrapper.findAll('.scenario-card')[0]
    const dots = card.findAll('.level-dot-wrapper')
    // 默认下一档是 A1，改选 A2（不限制只可选下一档）
    await dots[1].trigger('click')
    expect(card.find('.enter-button').text()).toBe('开始 A2')
    await card.find('.enter-button').trigger('click')
    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(wrapper.emitted('select')![0]).toEqual([
      'restaurant-ordering',
      { styleName: 'lazy-mature', level: 'A2' },
    ])
  })

  it('点击暂停卡片弹出恢复对话框', async () => {
    const snapshots = new Map<string, ScenarioPausedSnapshot>()
    snapshots.set('restaurant-ordering', {
      scenarioId: 'restaurant-ordering',
      level: 'A2',
      turnsCount: 8,
      maxTurns: 20,
      wordsUsed: ['coffee'],
      targetWords: ['coffee', 'tea'],
      serverSessionId: 'sess-456',
      savedAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    })
    const wrapper = mountComponent({ pausedSnapshots: snapshots })
    const card = wrapper.findAll('.scenario-card')[0]
    await card.trigger('click')
    await nextTick()

    expect(wrapper.emitted('select')).toBeUndefined()
    const dialog = wrapper.findComponent({ name: 'ScenarioResumeDialog' })
    expect(dialog.exists()).toBe(true)
  })

  it('暂停对话框点击「继续」发出 resume 事件', async () => {
    const snapshot: ScenarioPausedSnapshot = {
      scenarioId: 'restaurant-ordering',
      level: 'A2',
      turnsCount: 8,
      maxTurns: 20,
      wordsUsed: ['coffee'],
      targetWords: ['coffee', 'tea'],
      serverSessionId: 'sess-789',
      savedAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    }
    const snapshots = new Map<string, ScenarioPausedSnapshot>()
    snapshots.set('restaurant-ordering', snapshot)
    const wrapper = mountComponent({ pausedSnapshots: snapshots })

    await wrapper.findAll('.scenario-card')[0].trigger('click')
    await nextTick()

    const dialog = wrapper.findComponent({ name: 'ScenarioResumeDialog' })
    await dialog.find('.btn-resume').trigger('click')

    expect(wrapper.emitted('resume')).toHaveLength(1)
    expect(wrapper.emitted('resume')![0]).toEqual([snapshot, 'lazy-mature'])
  })

  it('暂停对话框点击「重新开始」发出 select 事件', async () => {
    const snapshot: ScenarioPausedSnapshot = {
      scenarioId: 'restaurant-ordering',
      level: 'A2',
      turnsCount: 8,
      maxTurns: 20,
      wordsUsed: ['coffee'],
      targetWords: ['coffee', 'tea'],
      serverSessionId: 'sess-abc',
      savedAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    }
    const snapshots = new Map<string, ScenarioPausedSnapshot>()
    snapshots.set('restaurant-ordering', snapshot)
    const wrapper = mountComponent({ pausedSnapshots: snapshots })

    await wrapper.findAll('.scenario-card')[0].trigger('click')
    await nextTick()

    const dialog = wrapper.findComponent({ name: 'ScenarioResumeDialog' })
    await dialog.find('.btn-restart').trigger('click')

    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(wrapper.emitted('select')![0]).toEqual([
      'restaurant-ordering',
      { styleName: 'lazy-mature', level: 'A2' },
    ])
  })

  it('已通关档的进度点显示金色与星数', () => {
    const progress = new Map<string, UserScenarioProgress>()
    progress.set('restaurant-ordering', {
      scenarioId: 'restaurant-ordering',
      highestClearedLevel: 'A1',
      starsByLevel: { A1: 5 },
      attempts: 1,
      lastPlayedAt: Date.now(),
    })
    const wrapper = mountComponent({ userScenarioProgress: progress })
    const card = wrapper.findAll('.scenario-card')[0]
    const dots = card.findAll('.level-dot')

    expect(dots[0].classes()).toContain('cleared')
    expect(dots[1].classes()).toContain('next')
    expect(dots[2].classes()).not.toContain('locked')
    expect(dots[2].classes()).not.toContain('cleared')
    expect(dots[2].classes()).not.toContain('next')
    expect(dots[0].find('.dot-star-count').text()).toBe('5')
  })

  it('自由对话按钮发出 free-chat 事件', async () => {
    const wrapper = mountComponent()
    await wrapper.find('.btn-free-chat').trigger('click')
    expect(wrapper.emitted('free-chat')).toHaveLength(1)
    expect(wrapper.emitted('free-chat')![0]).toEqual(['lazy-mature'])
  })
})
