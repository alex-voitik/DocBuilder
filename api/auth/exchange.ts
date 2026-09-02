import type { IncomingMessage, ServerResponse } from 'node:http'
import { decryptCode, encryptSession, sessionCookieHeader } from '../../server/auth.js'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') { res.writeHead(405).end(); return }

  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as { code?: string }

  if (!body.code) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Missing code' }))
    return
  }

  const session = decryptCode(body.code)
  if (!session) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Invalid or expired code' }))
    return
  }

  const isSecure = !req.headers.host?.startsWith('localhost')
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Set-Cookie': sessionCookieHeader(encryptSession(session), 365 * 24 * 60 * 60, isSecure),
  })
  res.end(JSON.stringify({ ok: true }))
}
