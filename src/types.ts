export interface ProductEntry {
  id: string
  product: string
  searchTerms: string[]
}

export interface DocResult {
  product: string
  searchTerm: string
  category: string
  title: string
  url: string
  availability: string
}

export interface SearchRequest {
  entries: Array<{
    product: string
    searchTerms: string[]
  }>
  depth?: number
}

export interface SearchResponse {
  results: DocResult[]
  totalUrls: number
  error?: string
}
