interface Props {
  categories: string[]
  selected: Set<string>
  onChange: (selected: Set<string>) => void
}

export default function CategoryFilter({ categories, selected, onChange }: Props) {
  const toggle = (cat: string) => {
    const next = new Set(selected)
    if (next.has(cat)) next.delete(cat)
    else next.add(cat)
    onChange(next)
  }

  const allSelected = categories.every(c => selected.has(c))

  return (
    <section className="category-filter">
      <div className="filter-header">
        <h2>Filter by Category</h2>
        <div className="filter-actions">
          <button
            className="btn-secondary"
            onClick={() => onChange(new Set(categories))}
            disabled={allSelected}
          >
            Select All
          </button>
          <button
            className="btn-secondary"
            onClick={() => onChange(new Set())}
            disabled={selected.size === 0}
          >
            Deselect All
          </button>
        </div>
      </div>
      <div className="filter-list">
        {categories.map(cat => (
          <label key={cat} className="filter-item">
            <input
              type="checkbox"
              checked={selected.has(cat)}
              onChange={() => toggle(cat)}
            />
            <span>{cat}</span>
          </label>
        ))}
      </div>
    </section>
  )
}
