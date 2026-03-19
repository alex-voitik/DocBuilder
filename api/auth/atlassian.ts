import type { IncomingMessage, ServerResponse } from 'node:http'
import crypto from 'node:crypto'

export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') { res.writeHead(405).end(); return }

  const isSecure = !req.headers.host?.startsWith('localhost')
  const state = crypto.randomBytes(16).toString('base64url')

  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: process.env.ATLASSIAN_CLIENT_ID ?? '',
    scope: 'read:me read:confluence-content.all',
    redirect_uri: process.env.ATLASSIAN_REDIRECT_URI ?? '',
    state,
    response_type: 'code',
    prompt: 'consent',
  })

  res.writeHead(302, {
    'Set-Cookie': `atl_state=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${isSecure ? '; Secure' : ''}`,
    'Location': `https://auth.atlassian.com/authorize?${params}`,
  })
  res.end()
}
