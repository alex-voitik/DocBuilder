import crypto from 'node:crypto'

const COOKIE_NAME = 'atl_session'
const ALGORITHM = 'aes-256-gcm'

export interface AuthSession {
  accessToken: string
  refreshToken: string
  expiresAt: number
  email: string
  displayName: string
  cloudId: string
  siteUrl: string
}

function getKey(): Buffer {
  const secret = process.env.COOKIE_SECRET
  if (!secret) throw new Error('COOKIE_SECRET environment variable is not set')
  return crypto.createHash('sha256').update(secret).digest()
}

export function encryptSession(session: AuthSession): string {
  const key = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(session), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, encrypted].map(b => b.toString('base64url')).join('.')
}

export function decryptSession(token: string): AuthSession | null {
  try {
    const [ivB64, tagB64, dataB64] = token.split('.')
    const key = getKey()
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
    const decrypted = decipher.update(Buffer.from(dataB64, 'base64url')).toString('utf8') + decipher.final('utf8')
    return JSON.parse(decrypted) as AuthSession
  } catch {
    return null
  }
}

export function parseCookies(header?: string): Record<string, string> {
  if (!header) return {}
  return Object.fromEntries(
    header.split(';').flatMap(c => {
      const idx = c.indexOf('=')
      if (idx < 0) return []
      return [[c.slice(0, idx).trim(), decodeURIComponent(c.slice(idx + 1).trim())]]
    })
  )
}

export function sessionCookieHeader(value: string, maxAge: number, secure: boolean): string {
  const parts = [`${COOKIE_NAME}=${value}`, 'HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${maxAge}`]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function clearSessionCookieHeader(secure: boolean): string {
  return sessionCookieHeader('', 0, secure)
}

export async function refreshIfExpired(session: AuthSession): Promise<{ session: AuthSession; refreshed: boolean }> {
  if (Date.now() < session.expiresAt - 60_000) return { session, refreshed: false }
  try {
    const res = await fetch('https://auth.atlassian.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: process.env.ATLASSIAN_CLIENT_ID,
        client_secret: process.env.ATLASSIAN_CLIENT_SECRET,
        refresh_token: session.refreshToken,
      }),
    })
    if (!res.ok) return { session, refreshed: false }
    const data = await res.json() as { access_token: string; expires_in: number }
    return {
      session: { ...session, accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 },
      refreshed: true,
    }
  } catch {
    return { session, refreshed: false }
  }
}

export { COOKIE_NAME }
