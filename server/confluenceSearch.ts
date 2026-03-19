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
  entries: Array<{ product: string; searchTerms: string[] }>
): Promise<ConfluenceResult[]> {
  const credentials = Buffer.from(`${email}:${apiToken}`).toString('base64')

  type Job = { product: string; searchTerm: string; query: string }
  const jobs: Job[] = entries.flatMap(entry => {
    if (entry.searchTerms.length === 0) {
      return [{ product: entry.product, searchTerm: '', query: entry.product }]
    }
    return entry.searchTerms.map(term => ({
      product: entry.product,
      searchTerm: term,
      query: `${entry.product} ${term}`,
    }))
  })

  const settled = await Promise.allSettled(
    jobs.map(job => cfSearch(credentials, job.query).then(pages => ({ job, pages })))
  )

  // Propagate auth errors immediately; surface first error if all queries failed
  const errors = settled.filter(r => r.status === 'rejected') as PromiseRejectedResult[]
  for (const r of errors) {
    const msg: string = r.reason?.message ?? ''
    if (msg.includes('Invalid Confluence') || msg.includes('Access denied')) {
      throw r.reason as Error
    }
  }
  if (errors.length === settled.length && settled.length > 0) {
    throw errors[0].reason as Error
  }

  const seen = new Set<string>()
  const results: ConfluenceResult[] = []

  for (const r of settled) {
    if (r.status !== 'fulfilled') continue
    const { job, pages } = r.value
    for (const page of pages) {
      const url = `https://datadoghq.atlassian.net/wiki${page._links.webui}`
      const key = `${job.product}|${url}`
      if (seen.has(key)) continue
      seen.add(key)
      results.push({
        product: job.product,
        searchTerm: job.searchTerm,
        space: page.space?.name ?? page.space?.key ?? '',
        title: page.title,
        url,
      })
    }
  }

  return results
}
