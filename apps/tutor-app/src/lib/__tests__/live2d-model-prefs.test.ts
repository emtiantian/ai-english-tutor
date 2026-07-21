/**
 * live2d-model-prefs.ts 单测
 *
 * 验证:
 * - localStorage 中合法 ID 优先,无效 ID 自动清掉并 fallback
 * - VITE_LIVE2D_MODEL_ID env 作为次选
 * - 默认 'mao_pro' 作为最后兜底
 * - localStorage 不可用时不抛错
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getLive2DModelId, setLive2DModelId, clearLive2DModelId } from '../live2d-model-prefs'

const STORAGE_KEY = 'tutor.live2dModelId'

describe('live2d-model-prefs', () => {
  beforeEach(() => {
    localStorage.clear()
    // 清掉 env 注入(vi.stubEnv 是 vitest 唯一能在测试期改 import.meta.env 的方式;
    // 直接赋值不行 — Vite 在转换源码时已经把 import.meta.env.VITE_* 静态替换了)
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    localStorage.clear()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  describe('getLive2DModelId', () => {
    it('returns DEFAULT (mao_pro) when nothing is set', () => {
      expect(getLive2DModelId()).toBe('mao_pro')
    })

    it('returns the stored value when it is a valid model id', () => {
      localStorage.setItem(STORAGE_KEY, 'shizuku')
      expect(getLive2DModelId()).toBe('shizuku')
    })

    it('returns mao_pro when stored', () => {
      localStorage.setItem(STORAGE_KEY, 'mao_pro')
      expect(getLive2DModelId()).toBe('mao_pro')
    })

    it('falls back to VITE env var when storage is empty', () => {
      vi.stubEnv('VITE_LIVE2D_MODEL_ID', 'shizuku')
      expect(getLive2DModelId()).toBe('shizuku')
    })

    it('storage wins over env var', () => {
      vi.stubEnv('VITE_LIVE2D_MODEL_ID', 'shizuku')
      localStorage.setItem(STORAGE_KEY, 'mao_pro')
      expect(getLive2DModelId()).toBe('mao_pro')
    })

    it('invalid stored id falls back to default AND clears storage', () => {
      localStorage.setItem(STORAGE_KEY, 'nonexistent_model')
      expect(getLive2DModelId()).toBe('mao_pro')
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('invalid env var falls back to default', () => {
      vi.stubEnv('VITE_LIVE2D_MODEL_ID', 'nonexistent_model')
      expect(getLive2DModelId()).toBe('mao_pro')
    })

    it('empty/whitespace env var falls back to default', () => {
      vi.stubEnv('VITE_LIVE2D_MODEL_ID', '   ')
      expect(getLive2DModelId()).toBe('mao_pro')
    })

    it('survives localStorage throwing (e.g. privacy mode)', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError')
      })
      expect(() => getLive2DModelId()).not.toThrow()
      expect(getLive2DModelId()).toBe('mao_pro')
    })
  })

  describe('setLive2DModelId', () => {
    it('stores a valid id', () => {
      setLive2DModelId('shizuku')
      expect(localStorage.getItem(STORAGE_KEY)).toBe('shizuku')
    })

    it('silently ignores invalid ids (no throw, no write)', () => {
      setLive2DModelId('totally_made_up')
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('overwrites previous selection', () => {
      setLive2DModelId('shizuku')
      setLive2DModelId('mao_pro')
      expect(localStorage.getItem(STORAGE_KEY)).toBe('mao_pro')
    })

    it('survives localStorage throwing on write', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
      expect(() => setLive2DModelId('shizuku')).not.toThrow()
    })
  })

  describe('clearLive2DModelId', () => {
    it('clears the stored selection', () => {
      setLive2DModelId('mao_pro')
      clearLive2DModelId()
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('is a no-op when nothing is stored', () => {
      expect(() => clearLive2DModelId()).not.toThrow()
    })
  })

  describe('round-trip integration', () => {
    it('set → get returns what was set', () => {
      for (const id of ['hiyori', 'shizuku', 'mao_pro']) {
        setLive2DModelId(id)
        expect(getLive2DModelId()).toBe(id)
      }
    })

    it('clear → get returns default (mao_pro)', () => {
      setLive2DModelId('shizuku')
      clearLive2DModelId()
      expect(getLive2DModelId()).toBe('mao_pro')
    })
  })
})
