import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ScenarioPicker from '../../src/components/ScenarioPicker.vue'

describe('ScenarioPicker', () => {
  it('shows scenarios and starts the selected conversation', async () => {
    const wrapper = mount(ScenarioPicker, {
      props: {
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
  })
})
