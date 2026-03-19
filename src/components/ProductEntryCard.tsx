import { useState, useRef } from 'react'
import type { ProductEntry } from '../types'

interface Props {
  entry: ProductEntry
  index: number
  onUpdate: (updates: Partial<ProductEntry>) => void
  onRemove?: () => void
}

export default function ProductEntryCard({ entry, index, onUpdate, onRemove }: Props) {
  const [techInput, setTechInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const addTech = (raw: string) => {
    const trimmed = raw.trim()
    if (trimmed && !entry.techStacks.includes(trimmed)) {
      onUpdate({ techStacks: [...entry.techStacks, trimmed] })
    }
    setTechInput('')
  }

  const removeTech = (tech: string) => {
    onUpdate({ techStacks: entry.techStacks.filter(t => t !== tech) })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTech(techInput)
    } else if (e.key === 'Backspace' && !techInput && entry.techStacks.length > 0) {
      removeTech(entry.techStacks[entry.techStacks.length - 1])
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
            Tech Stacks
            <span className="field-hint"> — press Enter to add, leave empty for all</span>
          </label>
          <div className="tag-input" onClick={() => inputRef.current?.focus()}>
            {entry.techStacks.map(tech => (
              <span key={tech} className="tag">
                {tech}
                <button type="button" onClick={() => removeTech(tech)}>
                  ×
                </button>
              </span>
            ))}
            <input
              ref={inputRef}
              type="text"
              placeholder={entry.techStacks.length === 0 ? 'Add tech stack…' : ''}
              value={techInput}
              onChange={e => setTechInput(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={() => { if (techInput.trim()) addTech(techInput) }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
