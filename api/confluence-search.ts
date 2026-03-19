import type { IncomingMessage, ServerResponse } from 'node:http'
import { searchConfluence } from '../server/confluenceSearch.js'
import type { ConfluenceSearchRequest } from '../src/types.js'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  let body: ConfluenceSearchRequest
  try {
    const raw = await new Promise<string>((resolve, reject) => {
      let data = ''
      req.on('data', chunk => { data += chunk })
      req.on('end', () => resolve(data))
      req.on('error', reject)
    })
    body = JSON.parse(raw) as ConfluenceSearchRequest
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Invalid JSON body' }))
    return
  }

  if (!body?.email || !body?.apiToken) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Request body must contain "email" and "apiToken".' }))
    return
  }

  const entries = (body?.entries ?? []).filter(
    e => typeof e.product === 'string' && e.product.trim()
  )

  if (entries.length === 0) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'No valid product entries provided.' }))
    return
  }

  try {
    const results = await searchConfluence(body.email, body.apiToken, entries)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ results }))
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message.includes('Invalid Confluence') || message.includes('Access denied') ? 401 : 500
    console.error('[api/confluence-search]', message)
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: message }))
  }
}
