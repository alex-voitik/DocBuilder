import crypto from 'node:crypto'
import express from 'express'
import { searchDocs } from './search.js'
import { searchConfluence } from './confluenceSearch.js'
import {
  parseCookies, decryptSession, encryptSession, encryptCode, decryptCode, refreshIfExpired,
  sessionCookieHeader, clearSessionCookieHeader, COOKIE_NAME,
  type AuthSession,
} from './auth.js'
import type { SearchRequest } from '../src/types.js'

const app = express()
app.use(express.json())

// ── Datadog Docs search ───────────────────────────────────────────────────────

app.post('/api/search', async (req, res) => {
  const body = req.body as SearchRequest

  if (!body?.entries || !Array.isArray(body.entries)) {
    res.status(400).json({ error: 'Request body must contain an "entries" array.' })
    return
  }

  const entries = body.entries.filter(e => typeof e.product === 'string' && e.product.trim())
  if (entries.length === 0) {
    res.status(400).json({ error: 'No valid product entries provided.' })
    return
  }

  try {
    const depth = typeof body.depth === 'number' && body.depth >= 1 ? body.depth : undefined
    const { results, totalFound } = await searchDocs(entries, depth)
    res.json({ results, totalUrls: totalFound })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[server] Search error:', message)
    res.status(500).json({ error: message })
  }
})

// ── Confluence OAuth ──────────────────────────────────────────────────────────

app.get('/api/auth/atlassian', (req, res) => {
  const state = crypto.randomBytes(16).toString('base64url')
  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: process.env.ATLASSIAN_CLIENT_ID ?? '',
    scope: 'read:confluence-content.all read:confluence-space.summary offline_access',
    redirect_uri: 'http://localhost:5173/api/auth/callback',
    state,
    response_type: 'code',
    prompt: 'consent',
  })
  res.setHeader('Set-Cookie', `atl_state=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`)
  res.redirect(`https://auth.atlassian.com/authorize?${params}`)
})

app.get('/api/auth/callback', async (req, res) => {
  const { code, state } = req.query as { code?: string; state?: string }
  const cookies = parseCookies(req.headers.cookie)

  if (!state || state !== cookies['atl_state']) {
    res.redirect('/?error=invalid_state'); return
  }
  if (!code) {
    res.redirect('/?error=no_code'); return
  }

  try {
    const tokenRes = await fetch('https://auth.atlassian.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: process.env.ATLASSIAN_CLIENT_ID,
        client_secret: process.env.ATLASSIAN_CLIENT_SECRET,
        code,
        redirect_uri: `http://localhost:5173/api/auth/callback`,
      }),
    })
    if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status}`)
    const tokens = await tokenRes.json() as { access_token: string; refresh_token: string; expires_in: number }

    const [resourcesRes, meRes] = await Promise.all([
      fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
        headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' },
      }),
      fetch('https://api.atlassian.com/me', {
        headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' },
      }),
    ])
    if (!resourcesRes.ok) throw new Error('Could not fetch accessible resources')

    const resources = await resourcesRes.json() as Array<{ id: string; url: string; scopes: string[] }>
    const site = resources.find(r => r.scopes.some(s => s.includes('confluence'))) ?? resources[0]
    if (!site) throw new Error('No Confluence instance found')

    const me = meRes.ok
      ? await meRes.json() as { email?: string; displayName?: string; name?: string }
      : {}

    const session: AuthSession = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      email: me.email ?? '',
      displayName: me.displayName ?? me.name ?? me.email ?? '',
      cloudId: site.id,
      siteUrl: site.url,
    }

    const onetimeCode = encryptCode(session)
    console.log('[callback] redirecting with one-time code, length:', onetimeCode.length)
    res.setHeader('Set-Cookie', `atl_state=; HttpOnly; Path=/; Max-Age=0`)
    res.redirect(`/?tab=confluence&code=${encodeURIComponent(onetimeCode)}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Auth error'
    console.error('[auth/callback]', message)
    res.redirect(`/?error=${encodeURIComponent(message)}`)
  }
})

app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', clearSessionCookieHeader(false))
  res.json({ ok: true })
})

app.post('/api/auth/exchange', (req, res) => {
  const { code } = req.body as { code?: string }
  console.log('[exchange] called, code present:', !!code, 'length:', code?.length)
  if (!code) { res.status(400).json({ error: 'Missing code' }); return }
  const session = decryptCode(code)
  console.log('[exchange] session:', session ? `ok (${session.email})` : 'null (invalid/expired)')
  if (!session) { res.status(400).json({ error: 'Invalid or expired code' }); return }
  res.setHeader('Set-Cookie', sessionCookieHeader(encryptSession(session), 365 * 24 * 60 * 60, false))
  console.log('[exchange] cookie set, responding ok')
  res.json({ ok: true })
})

app.get('/api/auth/me', (req, res) => {
  console.log('[me] cookie header:', req.headers.cookie ?? '(none)')
  const cookies = parseCookies(req.headers.cookie)
  const session = cookies[COOKIE_NAME] ? decryptSession(cookies[COOKIE_NAME]) : null
  console.log('[me] session:', session ? `ok (${session.email})` : 'null')
  if (!session) {
    res.json({ loggedIn: false })
  } else {
    res.json({ loggedIn: true, email: session.email, displayName: session.displayName })
  }
})

// ── Confluence search ─────────────────────────────────────────────────────────

app.post('/api/confluence-search', async (req, res) => {
  const cookies = parseCookies(req.headers.cookie)
  const rawSession = cookies[COOKIE_NAME] ? decryptSession(cookies[COOKIE_NAME]) : null

  if (!rawSession) {
    res.status(401).json({ error: 'Not authenticated. Please log in with Atlassian.' })
    return
  }

  const query = (req.body as { query?: string })?.query?.trim()
  if (!query) {
    res.status(400).json({ error: 'Request body must contain a "query" string.' })
    return
  }

  const { session, refreshed } = await refreshIfExpired(rawSession)
  if (refreshed) {
    res.setHeader('Set-Cookie', sessionCookieHeader(encryptSession(session), 365 * 24 * 60 * 60, false))
  }

  console.log('[confluence-search] cloudId:', session.cloudId, 'siteUrl:', session.siteUrl, 'token prefix:', session.accessToken.slice(0, 20))

  try {
    const results = await searchConfluence(session.accessToken, session.cloudId, session.siteUrl, query)
    res.json({ results })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message.includes('session expired') ? 401 : 500
    console.error('[server] Confluence search error:', message)
    res.status(status).json({ error: message })
  }
})

const PORT = process.env.PORT ?? 3001
app.listen(PORT, () => {
  console.log(`[server] Running on http://localhost:${PORT}`)
})
