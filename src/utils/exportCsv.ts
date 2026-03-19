import type { DocResult } from '../types'

export function exportToCsv(results: DocResult[], filename = 'datadog-docs.csv') {
  const headers = ['Product', 'Tech Stack', 'Page Title', 'Documentation URL']
  const rows = results.map(r => [r.product, r.techStack, r.title, r.url])

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  // UTF-8 BOM ensures correct encoding when opened in Google Sheets / Excel
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
