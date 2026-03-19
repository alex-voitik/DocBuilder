import type { IncomingMessage, ServerResponse } from 'node:http'
import { encryptCode, parseCookies, type AuthSession } from '../../server/auth.js'

async function exchangeCode(code: string): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const res = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: process.env.ATLASSIAN_CLIENT_ID,
      client_secret: process.env.ATLASSIAN_CLIENT_SECRET,
      code,
      redirect_uri: process.env.ATLASSIAN_REDIRECT_URI,
    }),
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`)
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>
}

async function getCloudInfo(accessToken: string): Promise<{ cloudId: string; siteUrl: string }> {
  const res = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error('Could not fetch accessible resources')
  const resources = await res.json() as Array<{ id: string; url: string; scopes: string[] }>
  const site = resources.find(r => r.scopes.some(s => s.includes('confluence'))) ?? resources[0]
  if (!site) throw new Error('No Confluence instance found for this account')
  return { cloudId: site.id, siteUrl: site.url }
}

async function getMe(accessToken: string): Promise<{ email: string; displayName: string }> {
  const res = await fetch('https://api.atlassian.com/me', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
  if (!res.ok) return { email: '', displayName: 'Atlassian User' }
  const me = await res.json() as { email?: string; displayName?: string; name?: string }
  return { email: me.email ?? '', displayName: me.displayName ?? me.name ?? me.email ?? 'Atlassian User' }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') { res.writeHead(405).end(); return }

  const url = new URL(req.url ?? '', `http://${req.headers.host}`)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const cookies = parseCookies(req.headers.cookie)
  const isSecure = !req.headers.host?.startsWith('localhost')

  if (!state || state !== cookies['atl_state']) {
    res.writeHead(302, { Location: '/?error=invalid_state' })
    res.end(); return
  }
  if (!code) {
    res.writeHead(302, { Location: '/?error=no_code' })
    res.end(); return
  }

  try {
    const tokens = await exchangeCode(code)
    const [{ cloudId, siteUrl }, { email, displayName }] = await Promise.all([
      getCloudInfo(tokens.access_token),
      getMe(tokens.access_token),
    ])

    const session: AuthSession = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      email,
      displayName,
      cloudId,
      siteUrl,
    }

    const code = encryptCode(session)
    res.writeHead(302, {
      'Set-Cookie': `atl_state=; HttpOnly; Path=/; Max-Age=0${isSecure ? '; Secure' : ''}`,
      'Location': `/?tab=confluence&code=${encodeURIComponent(code)}`,
    })
    res.end()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Authentication error'
    console.error('[auth/callback]', message)
    res.writeHead(302, { Location: `/?error=${encodeURIComponent(message)}` })
    res.end()
  }
}
