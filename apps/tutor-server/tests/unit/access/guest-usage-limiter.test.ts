import { describe, expect, it } from 'vitest'
import {
  GUEST_COOKIE_NAME,
  GUEST_TURN_LIMIT,
  GuestUsageLimiter
} from '@/access/guest-usage-limiter.js'

describe('GuestUsageLimiter', () => {
  it('同一签名游客身份最多完成五轮', () => {
    const limiter = new GuestUsageLimiter()
    const identity = limiter.identify(undefined, false)
    const cookieHeader = identity.cookie?.split(';')[0]
    const returning = limiter.identify(cookieHeader, false)

    expect(cookieHeader).toContain(`${GUEST_COOKIE_NAME}=`)
    expect(returning.id).toBe(identity.id)
    expect(returning.cookie).toBeUndefined()

    for (let turn = 0; turn < GUEST_TURN_LIMIT; turn += 1) {
      const reservation = limiter.reserveTurn(returning.id)
      expect(reservation).toBeDefined()
      reservation?.commit()
    }

    expect(limiter.reserveTurn(returning.id)).toBeUndefined()
    expect(limiter.getCompletedTurns(returning.id)).toBe(GUEST_TURN_LIMIT)
  })

  it('失败请求释放预占额度，并拒绝被篡改的 Cookie', () => {
    const limiter = new GuestUsageLimiter()
    const identity = limiter.identify(undefined, false)
    const reservation = limiter.reserveTurn(identity.id)
    reservation?.release()
    expect(limiter.getCompletedTurns(identity.id)).toBe(0)

    const tampered = limiter.identify(`${GUEST_COOKIE_NAME}=forged.invalid`, false)
    expect(tampered.id).not.toBe(identity.id)
    expect(tampered.cookie).toContain(`${GUEST_COOKIE_NAME}=`)
  })
})
