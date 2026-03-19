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

async function fetchViewCount(credentials: string, contentId: string): Promise<number> {
  try {
    const res = await fetch(
      `${CONFLUENCE_BASE}/analytics/content/${contentId}/views?fromDate=2010-01-01`,
      { headers: { Authorization: `Basic ${credentials}`, Accept: 'application/json' } }
    )
    if (!res.ok) return 0
    const data = await res.json() as { count?: number }
    return data.count ?? 0
  } catch {
    return 0
  }
}

async function cfSearch(credentials: string, query: string, limit = 25): Promise<ConfluencePage[]> {
  const cql = `type = page AND text ~ "${query.replace(/"/g, '\\"')}"`
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

export async function searchConfluence(
  email: string,
  apiToken: string,
  query: string
): Promise<ConfluenceResult[]> {
  const credentials = Buffer.from(`${email}:${apiToken}`).toString('base64')

  let pages: ConfluencePage[]
  try {
    pages = await cfSearch(credentials, query)
  } catch (err) {
    throw err
  }

  type Intermediate = ConfluenceResult & { contentId: string }
  const intermediate: Intermediate[] = pages.map(page => ({
    contentId: page.id,
    space: page.space?.name ?? page.space?.key ?? '',
    title: page.title,
    url: `https://datadoghq.atlassian.net/wiki${page._links.webui}`,
    views: 0,
  }))

  // Fetch view counts in parallel and sort most-viewed first
  const viewCounts = await Promise.all(
    intermediate.map(r => fetchViewCount(credentials, r.contentId))
  )

  return intermediate
    .map(({ contentId: _, ...r }, i) => ({ ...r, views: viewCounts[i] }))
    .sort((a, b) => b.views - a.views)
}
