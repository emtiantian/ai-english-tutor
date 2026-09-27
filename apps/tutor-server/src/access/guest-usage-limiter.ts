import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { LRUCache } from 'lru-cache'

export const GUEST_TURN_LIMIT = 5
export const GUEST_COOKIE_NAME = 'tutor_guest'

const GUEST_TTL_MS = 30 * 24 * 60 * 60 * 1000

interface GuestUsage {
  completedTurns: number
  reservedTurns: number
}

export interface GuestIdentity {
  id: string
  cookie?: string
}

export interface GuestTurnReservation {
  commit(): void
  release(): void
}

/**
 * 第一版游客额度存储在进程内：身份 Cookie 可跨标签页和场景复用，但服务重启后额度会重置。
 * 后续接入正式登录与持久化时，可以保留路由层契约并替换本实现。
 */
export class GuestUsageLimiter {
  private readonly signingSecret = randomUUID()
  private readonly usage = new LRUCache<string, GuestUsage>({
    max: 10_000,
    ttl: GUEST_TTL_MS
  })

  identify(cookieHeader: string | undefined, secure: boolean): GuestIdentity {
    const token = readCookie(cookieHeader, GUEST_COOKIE_NAME)
    const verifiedId = token && this.verifyToken(token)
    if (verifiedId) return { id: verifiedId }

    const id = randomUUID()
    return { id, cookie: this.serializeCookie(this.signToken(id), secure) }
  }

  reserveTurn(guestId: string): GuestTurnReservation | undefined {
    const current = this.usage.get(guestId) ?? { completedTurns: 0, reservedTurns: 0 }
    if (current.completedTurns + current.reservedTurns >= GUEST_TURN_LIMIT) return undefined

    current.reservedTurns += 1
    this.usage.set(guestId, current)
    let settled = false

    return {
      commit: () => {
        if (settled) return
        settled = true
        current.reservedTurns -= 1
        current.completedTurns += 1
        this.usage.set(guestId, current)
      },
      release: () => {
        if (settled) return
        settled = true
        current.reservedTurns -= 1
        this.usage.set(guestId, current)
      }
    }
  }

  getCompletedTurns(guestId: string): number {
    return this.usage.get(guestId)?.completedTurns ?? 0
  }

  private signToken(id: string): string {
    const signature = createHmac('sha256', this.signingSecret).update(id).digest('base64url')
    return `${id}.${signature}`
  }

  private verifyToken(token: string): string | undefined {
    const separator = token.lastIndexOf('.')
    if (separator <= 0) return undefined
    const id = token.slice(0, separator)
    const signature = token.slice(separator + 1)
    const expected = createHmac('sha256', this.signingSecret).update(id).digest('base64url')
    const actualBuffer = Buffer.from(signature)
    const expectedBuffer = Buffer.from(expected)
    if (actualBuffer.length !== expectedBuffer.length) return undefined
    return timingSafeEqual(actualBuffer, expectedBuffer) ? id : undefined
  }

  private serializeCookie(token: string, secure: boolean): string {
    const attributes = [
      `${GUEST_COOKIE_NAME}=${token}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${Math.floor(GUEST_TTL_MS / 1000)}`
    ]
    if (secure) attributes.push('Secure')
    return attributes.join('; ')
  }
}

function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=')
    if (rawName === name) return rawValue.join('=') || undefined
  }
  return undefined
}

export const guestUsageLimiter = new GuestUsageLimiter()
