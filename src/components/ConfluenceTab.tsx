import { useState, useEffect, useRef } from 'react'
import type { ConfluenceResult, ConfluenceSearchResponse, AtlassianUser } from '../types'

function exportConfluenceCsv(results: ConfluenceResult[]) {
  const headers = ['Space', 'Page Title', 'URL']
  const rows = results.map(r => [r.space, r.title, r.url])
  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'confluence-results.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function copyForSheets(results: ConfluenceResult[]) {
  const headers = ['Space', 'Page Title', 'URL']
  const rows = results.map(r => [r.space, r.title, r.url])
  const tsv = [headers, ...rows].map(row => row.join('\t')).join('\n')
  navigator.clipboard.writeText(tsv)
}

export default function ConfluenceTab() {
  // Capture URL params at render time — useEffect runs twice in StrictMode dev,
  // and the second run would see a cleared URL if we read inside the effect.
  const [initialCode] = useState(() => new URLSearchParams(window.location.search).get('code'))
  const exchangeAttempted = useRef(false)
  const [user, setUser] = useState<AtlassianUser | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ConfluenceResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [copied, setCopied] = useState(false)

  // Check login state on mount + handle error/code params from OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const oauthError = params.get('error')

    if (oauthError) {
      setError(`Login failed: ${oauthError}`)
      window.history.replaceState({}, '', window.location.pathname + '?tab=confluence')
    }

    const init = async () => {
      if (initialCode && !exchangeAttempted.current) {
        exchangeAttempted.current = true
        window.history.replaceState({}, '', window.location.pathname + '?tab=confluence')
        try {
          const res = await fetch('/api/auth/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: initialCode }),
          })
          if (!res.ok) throw new Error('Code exchange failed')
        } catch {
          setError('Login failed: could not complete authentication')
          setUser({ loggedIn: false })
          return
        }
      }
      fetch('/api/auth/me')
        .then(r => r.json())
        .then((data: AtlassianUser) => setUser(data))
        .catch(() => setUser({ loggedIn: false }))
    }

    init()
  }, [])

  const handleLogin = () => {
    window.location.href = '/api/auth/atlassian'
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser({ loggedIn: false })
    setResults([])
    setSearched(false)
  }

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    setResults([])
    setSearched(false)

    try {
      const res = await fetch('/api/confluence-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      })
      const data: ConfluenceSearchResponse = await res.json()
      if (!res.ok) {
        if (res.status === 401) setUser({ loggedIn: false })
        throw new Error(data.error ?? 'Confluence search failed')
      }
      setResults(data.results)
      setSearched(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    copyForSheets(results)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Still checking auth state
  if (user === null) {
    return (
      <div className="confluence-tab">
        <div className="loading-state">
          <div className="spinner" />
          <span>Checking login status…</span>
        </div>
      </div>
    )
  }

  // Not logged in
  if (!user.loggedIn) {
    return (
      <div className="confluence-tab">
        <section className="confluence-login">
          <h2>Connect to Confluence</h2>
          <p>Log in with your Atlassian account to search internal Confluence pages.</p>
          {error && <div className="error-banner">{error}</div>}
          <button className="btn-primary btn-atlassian" onClick={handleLogin}>
            Login with Atlassian
          </button>
        </section>
      </div>
    )
  }

  // Logged in
  return (
    <div className="confluence-tab">
      <div className="confluence-user-bar">
        <span>Logged in as <strong>{user.displayName || user.email || 'Atlassian User'}</strong></span>
        <button className="btn-link btn-link-danger" onClick={handleLogout}>Log out</button>
      </div>

      <div className="confluence-search-bar">
        <input
          type="text"
          className="confluence-search-input"
          placeholder="Search Confluence…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
          disabled={loading}
        />
        <button className="btn-primary" onClick={handleSearch} disabled={loading || !query.trim()}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading && (
        <div className="loading-state">
          <div className="spinner" />
          <span>Querying Confluence…</span>
        </div>
      )}

      {!loading && results.length > 0 && (
        <section className="results-section">
          <div className="results-header">
            <div>
              <h2>Results</h2>
              <p className="results-meta">{results.length} page{results.length !== 1 ? 's' : ''} found</p>
            </div>
            <div className="results-actions">
              <button className="btn-secondary export-btn" onClick={handleCopy}>
                {copied ? 'Copied!' : 'Copy for Sheets'}
              </button>
              <button className="btn-primary export-btn" onClick={() => exportConfluenceCsv(results)}>
                Export CSV
              </button>
            </div>
          </div>
          <div className="table-wrapper">
            <table className="results-table">
              <thead>
                <tr>
                  <th>Space</th>
                  <th>Page Title</th>
                  <th>URL</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i}>
                    <td>{r.space}</td>
                    <td>{r.title}</td>
                    <td>
                      <a href={r.url} target="_blank" rel="noopener noreferrer">{r.url}</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!loading && searched && results.length === 0 && (
        <div className="empty-state">No Confluence pages found for "{query}".</div>
      )}
    </div>
  )
}
