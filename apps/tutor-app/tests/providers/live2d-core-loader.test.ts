import { afterEach, describe, expect, it, vi } from 'vitest'

describe('loadLive2DCore', () => {
  afterEach(() => {
    document.getElementById('live2d-cubism-core')?.remove()
    Reflect.deleteProperty(globalThis, 'Live2DCubismCore')
    vi.resetModules()
  })

  it('loads the core script once and shares the pending request', async () => {
    const { loadLive2DCore } = await import('../../src/providers/live2d-core-loader.js')

    const firstLoad = loadLive2DCore()
    const secondLoad = loadLive2DCore()
    const script = document.getElementById('live2d-cubism-core')

    expect(secondLoad).toBe(firstLoad)
    expect(script).toBeInstanceOf(HTMLScriptElement)
    expect(document.querySelectorAll('#live2d-cubism-core')).toHaveLength(1)

    Reflect.set(globalThis, 'Live2DCubismCore', {})
    script?.dispatchEvent(new Event('load'))

    await expect(firstLoad).resolves.toBeUndefined()
  })
})
