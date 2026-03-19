import { useState, useMemo } from 'react'
import type { ProductEntry, DocResult, SearchResponse } from './types'
import ProductEntryCard from './components/ProductEntryCard'
import CategoryFilter from './components/CategoryFilter'
import ResultsTable from './components/ResultsTable'
import './App.css'

export default function App() {
  const [entries, setEntries] = useState<ProductEntry[]>([
    { id: '1', product: '', techStacks: [] },
  ])
  const [results, setResults] = useState<DocResult[]>([])
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [totalUrls, setTotalUrls] = useState<number | null>(null)

  const allCategories = useMemo(
    () => [...new Set(results.map(r => r.category))].sort(),
    [results]
  )

  const filteredResults = useMemo(
    () => results.filter(r => selectedCategories.has(r.category)),
    [results, selectedCategories]
  )

  const addEntry = () => {
    setEntries(prev => [...prev, { id: Date.now().toString(), product: '', techStacks: [] }])
  }

  const removeEntry = (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  const updateEntry = (id: string, updates: Partial<ProductEntry>) => {
    setEntries(prev => prev.map(e => (e.id === id ? { ...e, ...updates } : e)))
  }

  const handleSearch = async () => {
    const valid = entries.filter(e => e.product.trim())
    if (valid.length === 0) {
      setError('Please enter at least one product.')
      return
    }

    setLoading(true)
    setError(null)
    setResults([])
    setTotalUrls(null)

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: valid.map(e => ({ product: e.product, techStacks: e.techStacks })) }),
      })
      const data: SearchResponse = await res.json()
      if (!res.ok) throw new Error(data.error || 'Search failed')
      setResults(data.results)
      setSelectedCategories(new Set(data.results.map(r => r.category)))
      setTotalUrls(data.totalUrls)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>Datadog Doc Builder</h1>
          <p>Generate a documentation spreadsheet for any Datadog product + tech stack combination</p>
        </div>
      </header>

      <main className="app-main">
        <section className="products-section">
          <div className="section-header">
            <h2>Products</h2>
            <span className="hint">Leave tech stacks empty to return all documentation for that product</span>
          </div>

          <div className="entries-list">
            {entries.map((entry, index) => (
              <ProductEntryCard
                key={entry.id}
                entry={entry}
                index={index}
                onUpdate={updates => updateEntry(entry.id, updates)}
                onRemove={entries.length > 1 ? () => removeEntry(entry.id) : undefined}
              />
            ))}
          </div>

          <button className="btn-secondary" onClick={addEntry}>
            + Add Product
          </button>
        </section>

        {error && <div className="error-banner">{error}</div>}

        <button className="btn-primary generate-btn" onClick={handleSearch} disabled={loading}>
          {loading ? 'Searching docs.datadoghq.com…' : 'Generate Documentation'}
        </button>

        {loading && (
          <div className="loading-state">
            <div className="spinner" />
            <span>
              Fetching and indexing docs.datadoghq.com — the first request caches the sitemap,
              subsequent searches are instant.
            </span>
          </div>
        )}

        {!loading && results.length > 0 && (
          <>
            <CategoryFilter
              categories={allCategories}
              selected={selectedCategories}
              onChange={setSelectedCategories}
            />
            <ResultsTable results={filteredResults} totalUrls={totalUrls} />
          </>
        )}

        {!loading && results.length === 0 && totalUrls !== null && (
          <div className="empty-state">
            No documentation found for the given products and tech stacks.
            Try broadening your search or leaving tech stacks empty.
          </div>
        )}
      </main>
    </div>
  )
}
