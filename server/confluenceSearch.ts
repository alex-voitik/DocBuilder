import type { ConfluenceResult } from '../src/types.js'

interface ConfluencePage {
  id: string
  type: string
  title: string
  space: { key: string; name: string }
  _links: { webui: string }
}

interface ConfluenceApiResponse {
  results: ConfluencePage[]
  start: number
  limit: number
  size: number
  totalSize: number
}

const CONFLUENCE_BASE = 'https://datadoghq.atlassian.net/wiki/rest/api'

async function cfSearch(credentials: string, cql: string, limit = 50): Promise<ConfluencePage[]> {
  const url = `${CONFLUENCE_BASE}/content/search?cql=${encodeURIComponent(cql)}&limit=${limit}&expand=space`

  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: 'application/json',
    },
  })

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Invalid Confluence credentials. Check your email and API token.')
    }
    if (res.status === 403) {
      throw new Error('Access denied. Ensure your API token has Confluence access.')
    }
    let detail = res.statusText
    try {
      const body = await res.json() as { message?: string }
      if (body.message) detail = body.message
    } catch { /* ignore */ }
    throw new Error(`Confluence API error: ${res.status} ${detail}`)
  }

  const data = await res.json() as ConfluenceApiResponse
  return data.results ?? []
}

function buildTitleCql(query: string): string {
  const words = query.trim().split(/\s+/)
  const clauses = words.map(w => `title ~ "${w.replace(/"/g, '\\"')}"`)
  return `type = page AND ${clauses.join(' AND ')}`
}

export async function searchConfluence(
  email: string,
  apiToken: string,
  query: string
): Promise<ConfluenceResult[]> {
  const credentials = Buffer.from(`${email}:${apiToken}`).toString('base64')

  // Primary: title search — each word must appear in the title (any order)
  let pages = await cfSearch(credentials, buildTitleCql(query))

  // Fallback: if no title matches, run a full-text search
  if (pages.length === 0) {
    const q = query.replace(/"/g, '\\"')
    pages = await cfSearch(credentials, `type = page AND text ~ "${q}"`)
  }

  return pages.map(page => ({
    space: page.space?.name ?? page.space?.key ?? '',
    title: page.title,
    url: `https://datadoghq.atlassian.net/wiki${page._links.webui}`,
  }))
}
