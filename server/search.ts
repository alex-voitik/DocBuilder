/**
 * Searches docs.datadoghq.com using the Typesense API that powers the site's
 * own search bar. Credentials are public (read-only) and sourced from:
 * https://github.com/DataDog/documentation/blob/master/assets/scripts/config/config-docs.js
 */
import axios from 'axios'
import type { DocResult } from '../src/types.js'

const TYPESENSE_HOST = 'gk6e3zbyuntvc5dap-1.a1.typesense.net'
const TYPESENSE_API_KEY = 'bDUaL3uKrCG0033PDb6Vbi8n46mKGaMG'
const COLLECTION = 'docs_alias'
const SEARCH_URL = `https://${TYPESENSE_HOST}/collections/${COLLECTION}/documents/search`
const DOCS_BASE = 'https://docs.datadoghq.com'

// ── Typesense types ───────────────────────────────────────────────────────────

interface TSDocument {
  title?: string
  relpermalink?: string
  url?: string
  tags?: string[]
}

interface TSResponse {
  found: number
  hits: Array<{ document: TSDocument }>
}

// ── Core search ───────────────────────────────────────────────────────────────

async function tsSearch(query: string, perPage: number, page = 1, queryBy = 'title,tags'): Promise<TSResponse> {
  const { data } = await axios.get<TSResponse>(SEARCH_URL, {
    timeout: 12_000,
    headers: { 'X-TYPESENSE-API-KEY': TYPESENSE_API_KEY },
    params: {
      q: query,
      query_by: queryBy,
      filter_by: 'language:en',
      per_page: perPage,
      page,
    },
  })
  return data
}

function categoryFromUrl(url: string): string {
  const path = url.replace('https://docs.datadoghq.com', '').replace(/^\/|\/$/g, '')
  return path
    .split('/')
    .filter(Boolean)
    .map(s =>
      s.replace(/^dd_/i, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
    )
    .join(' > ')
}

function urlFromDoc(doc: TSDocument): string | null {
  const raw = doc.url ?? (doc.relpermalink
    ? (doc.relpermalink.startsWith('http') ? doc.relpermalink : DOCS_BASE + doc.relpermalink)
    : null)
  if (!raw) return null
  // Strip anchor fragments so the same page isn't listed multiple times
  return raw.split('#')[0].replace(/\/$/, '') + '/'
}

/**
 * Returns a small set (≤5) of top-level overview/setup pages for a product.
 * Strategy: search for the product name, strip anchor fragments, then keep only
 * shallow URL paths (depth ≤ 2) — those are the landing/overview pages.
 */
async function fetchOverviewAndSetup(product: string): Promise<TSDocument[]> {
  const res = await tsSearch(product, 50)

  const seen = new Set<string>()
  const result: TSDocument[] = []

  for (const hit of res.hits) {
    const url = urlFromDoc(hit.document)
    if (!url || seen.has(url)) continue

    const depth = url.replace('https://docs.datadoghq.com', '').replace(/^\/|\/$/g, '').split('/').filter(Boolean).length
    if (depth > 2) continue

    seen.add(url)
    result.push(hit.document)
    if (result.length === 5) break
  }
  return result
}

/** Fetch up to `maxPages` pages of results for a query. */
async function fetchAllPages(query: string, perPage = 250, maxPages = 4): Promise<TSDocument[]> {
  const first = await tsSearch(query, perPage, 1, 'title,tags,content')
  const docs: TSDocument[] = first.hits.map(h => h.document)

  const totalPages = Math.min(Math.ceil(first.found / perPage), maxPages)
  if (totalPages > 1) {
    const rest = await Promise.allSettled(
      Array.from({ length: totalPages - 1 }, (_, i) => tsSearch(query, perPage, i + 2, 'title,tags,content'))
    )
    for (const r of rest) {
      if (r.status === 'fulfilled') docs.push(...r.value.hits.map(h => h.document))
    }
  }
  return docs
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SearchEntry {
  product: string
  searchTerms: string[]
}

// ── Availability detection ─────────────────────────────────────────────────────

// Matches the "Join the Preview" callout-card box specifically.
// The card HTML is: <div class="card callout-card ..."> ... Join the Preview ... </div>
// We look for callout-card followed by "join the preview" within 600 chars.
const CALLOUT_PREVIEW_RE = /callout-card[^]{0,600}join\s+the\s+preview/i

async function checkAvailability(url: string): Promise<string> {
  try {
    const { data } = await axios.get<string>(url, {
      timeout: 5_000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DocBuilder/1.0)' },
      responseType: 'text',
    })
    const html: string = typeof data === 'string' ? data : ''
    if (CALLOUT_PREVIEW_RE.test(html)) return 'Preview'
    return ''
  } catch {
    return ''
  }
}

async function fetchAvailability(urls: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(urls)]
  const result = new Map<string, string>()
  const CONCURRENCY = 10

  let i = 0
  async function worker() {
    while (i < unique.length) {
      const url = unique[i++]
      result.set(url, await checkAvailability(url))
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, unique.length) }, worker))
  return result
}

function urlDepth(url: string): number {
  return url.replace('https://docs.datadoghq.com', '').replace(/^\/|\/$/g, '').split('/').filter(Boolean).length
}

export async function searchDocs(
  entries: SearchEntry[],
  depth?: number
): Promise<{ results: DocResult[]; totalFound: number }> {
  const results: DocResult[] = []
  const seen = new Set<string>()
  let totalFound = 0

  const push = (r: Omit<DocResult, 'availability'>) => {
    if (depth !== undefined && urlDepth(r.url) > depth) return
    const key = `${r.product}|${r.searchTerm}|${r.url}`
    if (!seen.has(key)) { seen.add(key); results.push({ ...r, availability: '' }) }
  }

  // Separate entries into "all docs" vs "term-specific + overview"
  type QueryJob = { product: string; searchTerm: string; query: string; allDocs: boolean }
  const jobs: QueryJob[] = []
  const productsNeedingOverview = new Set<string>()

  for (const entry of entries) {
    const product = entry.product.trim()
    if (entry.searchTerms.length === 0) {
      jobs.push({ product, searchTerm: 'All', query: product, allDocs: true })
    } else {
      productsNeedingOverview.add(product)
      for (const term of entry.searchTerms) {
        jobs.push({ product, searchTerm: term, query: `${product} ${term}`, allDocs: false })
      }
    }
  }

  // Run search queries and overview queries concurrently
  const [settled, overviewResults] = await Promise.all([
    Promise.allSettled(
      jobs.map(async job => {
        let docs: TSDocument[]
        if (job.allDocs) {
          docs = await fetchAllPages(job.query, 250, 4)
        } else {
          // Run both orderings concurrently to catch pages where the term
          // is the primary URL segment (e.g. "agent" in /agent/logs/)
          const reversedQuery = `${job.searchTerm} ${job.product}`
          const [fwd, rev] = await Promise.all([
            tsSearch(job.query, 250),
            tsSearch(reversedQuery, 250),
          ])
          const seen = new Set<string>()
          docs = []
          for (const hit of [...fwd.hits, ...rev.hits]) {
            const url = urlFromDoc(hit.document)
            if (url && !seen.has(url)) {
              seen.add(url)
              docs.push(hit.document)
            }
          }
        }
        return { job, docs }
      })
    ),
    Promise.allSettled(
      [...productsNeedingOverview].map(async product => ({
        product,
        docs: await fetchOverviewAndSetup(product),
      }))
    ),
  ])

  // Add overview & setup results first (once per product, before tech-specific rows)
  for (const r of overviewResults) {
    if (r.status === 'rejected') continue
    for (const doc of r.value.docs) {
      const url = urlFromDoc(doc)
      if (!url) continue
      push({ product: r.value.product, searchTerm: 'Overview & Setup', category: categoryFromUrl(url), title: doc.title ?? url, url })
    }
  }

  // Add tech-specific results
  for (const result of settled) {
    if (result.status === 'rejected') {
      console.warn('[search] Query failed:', result.reason?.message)
      continue
    }
    const { job, docs } = result.value
    totalFound += docs.length

    if (docs.length === 0 && !job.allDocs) {
      // No term-specific results — fall back to top product results
      const fallback = await tsSearch(job.product, 10)
      for (const h of fallback.hits.slice(0, 5)) {
        const url = urlFromDoc(h.document)
        if (!url) continue
        push({
          product: job.product,
          searchTerm: job.searchTerm,
          category: categoryFromUrl(url),
          title: `${h.document.title ?? url} (no ${job.searchTerm}-specific page found)`,
          url,
        })
      }
      continue
    }

    for (const doc of docs) {
      const url = urlFromDoc(doc)
      if (!url) continue
      push({ product: job.product, searchTerm: job.searchTerm, category: categoryFromUrl(url), title: doc.title ?? url, url })
    }
  }

  // Fetch availability for all result URLs concurrently
  const availMap = await fetchAvailability(results.map(r => r.url))
  for (const r of results) r.availability = availMap.get(r.url) ?? ''

  return { results, totalFound }
}
