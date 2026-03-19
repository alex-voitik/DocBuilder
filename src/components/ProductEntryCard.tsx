import { useState, useRef } from 'react'
import type { ProductEntry } from '../types'

interface Props {
  entry: ProductEntry
  index: number
  onUpdate: (updates: Partial<ProductEntry>) => void
  onRemove?: () => void
}

export default function ProductEntryCard({ entry, index, onUpdate, onRemove }: Props) {
  const [termInput, setTermInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const addTerm = (raw: string) => {
    const trimmed = raw.trim()
    if (trimmed && !entry.searchTerms.includes(trimmed)) {
      onUpdate({ searchTerms: [...entry.searchTerms, trimmed] })
    }
    setTermInput('')
  }

  const removeTerm = (term: string) => {
    onUpdate({ searchTerms: entry.searchTerms.filter(t => t !== term) })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTerm(termInput)
    } else if (e.key === 'Backspace' && !termInput && entry.searchTerms.length > 0) {
      removeTerm(entry.searchTerms[entry.searchTerms.length - 1])
    }
  }

  return (
    <div className="entry-card">
      <div className="entry-header">
        <span className="entry-number">Product {index + 1}</span>
        {onRemove && (
          <button className="btn-remove" onClick={onRemove} title="Remove">
            ×
          </button>
        )}
      </div>

      <div className="entry-fields">
        <div className="field">
          <label>Product</label>
          <input
            type="text"
            placeholder="e.g. APM, Log Management…"
            value={entry.product}
            onChange={e => onUpdate({ product: e.target.value })}
          />
        </div>

        <div className="field">
          <label>
            Search Parameters
            <span className="field-hint"> — tech stack, category, keyword… press Enter to add, leave empty for all</span>
          </label>
          <div className="tag-input" onClick={() => inputRef.current?.focus()}>
            {entry.searchTerms.map(term => (
              <span key={term} className="tag">
                {term}
                <button type="button" onClick={() => removeTerm(term)}>
                  ×
                </button>
              </span>
            ))}
            <input
              ref={inputRef}
              type="text"
              placeholder={entry.searchTerms.length === 0 ? 'Add search term…' : ''}
              value={termInput}
              onChange={e => setTermInput(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={() => { if (termInput.trim()) addTerm(termInput) }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
