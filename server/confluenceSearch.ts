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

async function cfSearch(
  accessToken: string,
  cloudId: string,
  cql: string,
  limit = 50
): Promise<ConfluencePage[]> {
  const base = `https://api.atlassian.com/ex/confluence/${cloudId}/rest/api`
  const url = `${base}/content/search?cql=${encodeURIComponent(cql)}&limit=${limit}&expand=space`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })

  if (!res.ok) {
    if (res.status === 401) throw new Error('Atlassian session expired. Please log in again.')
    if (res.status === 403) throw new Error('Access denied to Confluence.')
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
  accessToken: string,
  cloudId: string,
  siteUrl: string,
  query: string
): Promise<ConfluenceResult[]> {
  // Primary: title search — each word must appear in the title (any order)
  let pages = await cfSearch(accessToken, cloudId, buildTitleCql(query))

  // Fallback: full-text search if no title matches
  if (pages.length === 0) {
    const q = query.replace(/"/g, '\\"')
    pages = await cfSearch(accessToken, cloudId, `type = page AND text ~ "${q}"`)
  }

  return pages.map(page => ({
    space: page.space?.name ?? page.space?.key ?? '',
    title: page.title,
    url: `${siteUrl}/wiki${page._links.webui}`,
  }))
}
