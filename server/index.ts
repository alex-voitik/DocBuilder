import express from 'express'
import { searchDocs } from './search.js'
import type { SearchRequest } from '../src/types.js'

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

const PORT = process.env.PORT ?? 3001
app.listen(PORT, () => {
  console.log(`[server] Running on http://localhost:${PORT}`)
})
