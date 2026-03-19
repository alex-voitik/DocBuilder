import type { IncomingMessage, ServerResponse } from 'node:http'
import { searchConfluence } from '../server/confluenceSearch.js'
import { parseCookies, decryptSession, encryptSession, refreshIfExpired, sessionCookieHeader, COOKIE_NAME } from '../server/auth.js'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  const cookies = parseCookies(req.headers.cookie)
  const rawSession = cookies[COOKIE_NAME] ? decryptSession(cookies[COOKIE_NAME]) : null

  if (!rawSession) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not authenticated. Please log in with Atlassian.' }))
    return
  }

  let body: { query?: string }
  try {
    const raw = await new Promise<string>((resolve, reject) => {
      let data = ''
      req.on('data', chunk => { data += chunk })
      req.on('end', () => resolve(data))
      req.on('error', reject)
    })
    body = JSON.parse(raw) as { query?: string }
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Invalid JSON body' }))
    return
  }

  if (!body?.query?.trim()) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Request body must contain a "query" string.' }))
    return
  }

  const { session, refreshed } = await refreshIfExpired(rawSession)
  const isSecure = !req.headers.host?.startsWith('localhost')

  try {
    const results = await searchConfluence(session.accessToken, session.cloudId, session.siteUrl, body.query.trim())
    const headers: Record<string, string | string[]> = { 'Content-Type': 'application/json' }
    if (refreshed) headers['Set-Cookie'] = sessionCookieHeader(encryptSession(session), 365 * 24 * 60 * 60, isSecure)
    res.writeHead(200, headers)
    res.end(JSON.stringify({ results }))
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message.includes('session expired') ? 401 : 500
    console.error('[api/confluence-search]', message)
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: message }))
  }
}
