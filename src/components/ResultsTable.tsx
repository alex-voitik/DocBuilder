import type { DocResult } from '../types'
import { exportToCsv } from '../utils/exportCsv'

interface Props {
  results: DocResult[]
  totalUrls: number | null
}

export default function ResultsTable({ results, totalUrls }: Props) {
  return (
    <section className="results-section">
      <div className="results-header">
        <div>
          <h2>Results</h2>
          <p className="results-meta">
            {results.length} documentation link{results.length !== 1 ? 's' : ''} found on docs.datadoghq.com
          </p>
        </div>
        <button className="btn-primary export-btn" onClick={() => exportToCsv(results)}>
          Export to CSV
        </button>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
