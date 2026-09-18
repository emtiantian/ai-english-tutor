import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ScenarioPicker from '../../src/components/ScenarioPicker.vue'

describe('ScenarioPicker', () => {
  it('shows scenarios and starts the selected conversation', async () => {
    const wrapper = mount(ScenarioPicker, {
      props: {
        voiceDesign: '温柔、清晰、自然的成年女性英语教师，语速适中，发音清楚',
        level: 4,
        scenarios: [
          {
            id: 'restaurant-ordering',
            name: '餐厅点餐',
            nameEn: 'Restaurant Ordering',
            icon: '🍽️'
          },
          { id: 'shopping', name: '购物对话', nameEn: 'Shopping', icon: '🛒' }
        ]
      }
    })

    expect(wrapper.text()).toContain('餐厅点餐')
    expect(wrapper.text()).toContain('Restaurant Ordering')
    await wrapper.findAll('section button')[0].trigger('click')

    expect(wrapper.emitted('select')).toEqual([['restaurant-ordering']])

    expect((wrapper.get('select[aria-label="对话难度"]').element as HTMLSelectElement).value).toBe(
      '4'
    )
    await wrapper.get('select[aria-label="对话难度"]').setValue('3')
    expect(wrapper.emitted('update:level')).toEqual([[3]])

    await wrapper
      .get('select[aria-label="老师音色"]')
      .setValue('活泼明亮的年轻女性声音，节奏轻快，英语发音清晰自然')
    expect(wrapper.emitted('update:voiceDesign')).toHaveLength(1)
  })
})
