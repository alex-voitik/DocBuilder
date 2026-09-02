import type { IncomingMessage, ServerResponse } from 'node:http'
import { parseCookies, decryptSession, COOKIE_NAME } from '../../server/auth.js'

export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') { res.writeHead(405).end(); return }

  const cookies = parseCookies(req.headers.cookie)
  const session = cookies[COOKIE_NAME] ? decryptSession(cookies[COOKIE_NAME]) : null

  res.writeHead(200, { 'Content-Type': 'application/json' })
  if (!session) {
    res.end(JSON.stringify({ loggedIn: false }))
  } else {
    res.end(JSON.stringify({ loggedIn: true, email: session.email, displayName: session.displayName }))
  }
}
