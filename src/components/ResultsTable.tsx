import { useState } from 'react'
import type { DocResult } from '../types'
import { exportToCsv } from '../utils/exportCsv'

interface Props {
  results: DocResult[]
  totalUrls: number | null
}

function copyForSheets(results: DocResult[]) {
  const headers = ['Product', 'Search Parameter', 'Category', 'Page Title', 'Documentation URL', 'Availability']
  const rows = results.map(r => [r.product, r.searchTerm, r.category, r.title, r.url, r.availability])
  const tsv = [headers, ...rows].map(row => row.join('\t')).join('\n')
  navigator.clipboard.writeText(tsv)
}

export default function ResultsTable({ results, totalUrls }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    copyForSheets(results)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="results-section">
      <div className="results-header">
        <div>
          <h2>Results</h2>
          <p className="results-meta">
            {results.length} documentation link{results.length !== 1 ? 's' : ''} found on docs.datadoghq.com
          </p>
        </div>
        <div className="results-actions">
          <button className="btn-secondary" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy for Sheets'}
          </button>
          <button className="btn-primary export-btn" onClick={() => exportToCsv(results)}>
            Export CSV
          </button>
        </div>
      </div>

      <div className="table-wrapper">
        <table className="results-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Search Parameter</th>
              <th>Category</th>
              <th>Page Title</th>
              <th>Documentation URL</th>
              <th>Availability</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={i}>
                <td>
                  <span className="product-badge">{r.product}</span>
                </td>
                <td>{r.searchTerm}</td>
                <td>{r.category}</td>
                <td>{r.title}</td>
                <td>
                  <a href={r.url} target="_blank" rel="noopener noreferrer">
                    {r.url}
                  </a>
                </td>
                <td>
                  {r.availability && (
                    <span className={`availability-badge availability-${r.availability.toLowerCase().replace(/\s+/g, '-')}`}>
                      {r.availability}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
