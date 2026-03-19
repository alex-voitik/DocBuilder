import { useState } from 'react'
import type { ConfluenceResult, ConfluenceSearchResponse } from '../types'

const CREDS_KEY = 'confluence_credentials'

interface Credentials {
  email: string
  apiToken: string
}

function loadCredentials(): Credentials | null {
  try {
    const raw = localStorage.getItem(CREDS_KEY)
    return raw ? (JSON.parse(raw) as Credentials) : null
  } catch {
    return null
  }
}

function exportConfluenceCsv(results: ConfluenceResult[]) {
  const headers = ['Space', 'Page Title', 'URL', 'Views']
  const rows = results.map(r => [r.space, r.title, r.url, String(r.views)])
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
  const headers = ['Space', 'Page Title', 'URL', 'Views']
  const rows = results.map(r => [r.space, r.title, r.url, String(r.views)])
  const tsv = [headers, ...rows].map(row => row.join('\t')).join('\n')
  navigator.clipboard.writeText(tsv)
}

export default function ConfluenceTab() {
  const [creds, setCreds] = useState<Credentials | null>(loadCredentials)
  const [editingCreds, setEditingCreds] = useState<boolean>(() => !loadCredentials())
  const [emailInput, setEmailInput] = useState('')
  const [tokenInput, setTokenInput] = useState('')

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ConfluenceResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [copied, setCopied] = useState(false)

  const saveCreds = () => {
    if (!emailInput.trim() || !tokenInput.trim()) return
    const newCreds = { email: emailInput.trim(), apiToken: tokenInput.trim() }
    localStorage.setItem(CREDS_KEY, JSON.stringify(newCreds))
    setCreds(newCreds)
    setEditingCreds(false)
    setTokenInput('')
  }

  const startEditing = () => {
    setEmailInput(creds?.email ?? '')
    setTokenInput('')
    setEditingCreds(true)
  }

  const clearCreds = () => {
    localStorage.removeItem(CREDS_KEY)
    setCreds(null)
    setEditingCreds(true)
    setEmailInput('')
    setTokenInput('')
    setResults([])
    setSearched(false)
  }

  const handleSearch = async () => {
    if (!creds || !query.trim()) return
    setLoading(true)
    setError(null)
    setResults([])
    setSearched(false)

    try {
      const res = await fetch('/api/confluence-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: creds.email, apiToken: creds.apiToken, query: query.trim() }),
      })
      const data: ConfluenceSearchResponse = await res.json()
      if (!res.ok) {
        if (res.status === 401) clearCreds()
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

  return (
    <div className="confluence-tab">
      {/* Credentials */}
      <section className="credentials-section">
        {!editingCreds && creds ? (
          <div className="creds-connected">
            <span className="creds-status">
              Connected as <strong>{creds.email}</strong>
            </span>
            <div className="creds-connected-actions">
              <button className="btn-link" onClick={startEditing}>Change</button>
              <button className="btn-link btn-link-danger" onClick={clearCreds}>Disconnect</button>
            </div>
          </div>
        ) : (
          <div className="creds-form">
            <div className="creds-form-header">
              <h3>Connect to Confluence</h3>
              <p>
                Enter your Datadog email and an{' '}
                <a
                  href="https://id.atlassian.com/manage-profile/security/api-tokens"
                  target="_blank"
                  rel="noreferrer"
                >
                  Atlassian API token
                </a>
                . Credentials are stored in your browser only.
              </p>
            </div>
            <div className="creds-fields">
              <div className="field">
                <label>Company Email</label>
                <input
                  type="email"
                  placeholder="you@datadoghq.com"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                />
              </div>
              <div className="field">
                <label>API Token</label>
                <input
                  type="password"
                  placeholder="Paste your Atlassian API token"
                  value={tokenInput}
                  onChange={e => setTokenInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveCreds() }}
                />
              </div>
            </div>
            <div className="creds-actions">
              <button
                className="btn-primary"
                onClick={saveCreds}
                disabled={!emailInput.trim() || !tokenInput.trim()}
              >
                Save & Connect
              </button>
              {creds && (
                <button className="btn-secondary" onClick={() => setEditingCreds(false)}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Search bar — only when connected */}
      {creds && !editingCreds && (
        <>
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
            <button
              className="btn-primary"
              onClick={handleSearch}
              disabled={loading || !query.trim()}
            >
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>

          {error && <div className="error-banner">{error}</div>}

          {loading && (
            <div className="loading-state">
              <div className="spinner" />
              <span>Querying datadoghq.atlassian.net…</span>
            </div>
          )}

          {!loading && results.length > 0 && (
            <section className="results-section">
              <div className="results-header">
                <div>
                  <h2>Results</h2>
                  <p className="results-meta">
                    {results.length} page{results.length !== 1 ? 's' : ''} found, sorted by views
                  </p>
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
                      <th>Views</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i}>
                        <td>{r.space}</td>
                        <td>{r.title}</td>
                        <td>
                          <a href={r.url} target="_blank" rel="noopener noreferrer">
                            {r.url}
                          </a>
                        </td>
                        <td>{r.views > 0 ? r.views.toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {!loading && searched && results.length === 0 && (
            <div className="empty-state">
              No Confluence pages found for "{query}".
            </div>
          )}
        </>
      )}
    </div>
  )
}
