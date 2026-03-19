export interface ProductEntry {
  id: string
  product: string
  techStacks: string[]
}

export interface DocResult {
  product: string
  techStack: string
  title: string
  url: string
}

export interface SearchRequest {
  entries: Array<{
    product: string
    techStacks: string[]
  }>
}

export interface SearchResponse {
  results: DocResult[]
  totalUrls: number
  error?: string
}
