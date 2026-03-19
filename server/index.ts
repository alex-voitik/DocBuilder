import express from 'express'
import { searchDocs } from './search.js'
import { searchConfluence } from './confluenceSearch.js'
import type { SearchRequest, ConfluenceSearchRequest } from '../src/types.js'

const app = express()
app.use(express.json())

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

app.post('/api/confluence-search', async (req, res) => {
  const body = req.body as ConfluenceSearchRequest

  if (!body?.email || !body?.apiToken) {
    res.status(400).json({ error: 'Request body must contain "email" and "apiToken".' })
    return
  }

  if (!body?.query?.trim()) {
    res.status(400).json({ error: 'Request body must contain a "query" string.' })
    return
  }

  try {
    const results = await searchConfluence(body.email, body.apiToken, body.query.trim())
    res.json({ results })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message.includes('Invalid Confluence') || message.includes('Access denied') ? 401 : 500
    console.error('[server] Confluence search error:', message)
    res.status(status).json({ error: message })
  }
})

const PORT = process.env.PORT ?? 3001
app.listen(PORT, () => {
  console.log(`[server] Running on http://localhost:${PORT}`)
})
