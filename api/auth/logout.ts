import type { IncomingMessage, ServerResponse } from 'node:http'
import { clearSessionCookieHeader } from '../../server/auth.js'

export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') { res.writeHead(405).end(); return }
  const isSecure = !req.headers.host?.startsWith('localhost')
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Set-Cookie': clearSessionCookieHeader(isSecure),
  })
  res.end(JSON.stringify({ ok: true }))
}
