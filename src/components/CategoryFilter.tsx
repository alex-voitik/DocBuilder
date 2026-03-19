import { useState, useMemo } from 'react'

// ── Tree data structure ───────────────────────────────────────────────────────

interface CategoryNode {
  label: string
  path: string
  children: CategoryNode[]
  /** Every leaf category string contained within this subtree */
  leafCategories: string[]
}

function buildTree(categories: string[]): CategoryNode[] {
  const nodeMap = new Map<string, CategoryNode>()
  const roots: CategoryNode[] = []

  // First pass: create all nodes and wire up parent→child relationships
  for (const cat of categories) {
    const segments = cat.split(' > ')
    for (let i = 0; i < segments.length; i++) {
      const path = segments.slice(0, i + 1).join(' > ')
      if (!nodeMap.has(path)) {
        const node: CategoryNode = { label: segments[i], path, children: [], leafCategories: [] }
        nodeMap.set(path, node)
        if (i === 0) roots.push(node)
        else nodeMap.get(segments.slice(0, i).join(' > '))!.children.push(node)
      }
    }
    // Second pass for this category: propagate the leaf path up to all ancestors
    for (let i = 1; i <= segments.length; i++) {
      nodeMap.get(segments.slice(0, i).join(' > '))!.leafCategories.push(cat)
    }
  }

  return roots
}

// ── Recursive tree node component ────────────────────────────────────────────

interface NodeProps {
  node: CategoryNode
  selected: Set<string>
  expanded: Set<string>
  onToggle: (leafCats: string[], addAll: boolean) => void
  onExpand: (path: string) => void
  depth: number
}

function TreeNodeRow({ node, selected, expanded, onToggle, onExpand, depth }: NodeProps) {
  const checkedCount = node.leafCategories.filter(c => selected.has(c)).length
  const isChecked = checkedCount === node.leafCategories.length && node.leafCategories.length > 0
  const isIndeterminate = checkedCount > 0 && !isChecked
  const isExpanded = expanded.has(node.path)
  const hasChildren = node.children.length > 0

  return (
    <div className="tree-node" style={{ paddingLeft: depth > 0 ? `${depth * 18}px` : undefined }}>
      <div className="tree-row">
        <button
          className="tree-expand-btn"
          onClick={() => onExpand(node.path)}
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
          style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
        >
          {isExpanded ? '▾' : '▸'}
        </button>
        <label className="filter-item">
          <input
            type="checkbox"
            checked={isChecked}
            ref={el => { if (el) el.indeterminate = isIndeterminate }}
            onChange={() => onToggle(node.leafCategories, !isChecked)}
          />
          <span className="tree-label">{node.label}</span>
          <span className="tree-count">{node.leafCategories.length}</span>
        </label>
      </div>
      {hasChildren && isExpanded && (
        <div>
          {node.children.map(child => (
            <TreeNodeRow
              key={child.path}
              node={child}
              selected={selected}
              expanded={expanded}
              onToggle={onToggle}
              onExpand={onExpand}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Public component ──────────────────────────────────────────────────────────

interface Props {
  categories: string[]
  selected: Set<string>
  onChange: (selected: Set<string>) => void
}

export default function CategoryFilter({ categories, selected, onChange }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const tree = useMemo(() => buildTree(categories), [categories])

  const handleToggle = (leafCats: string[], addAll: boolean) => {
    const next = new Set(selected)
    for (const cat of leafCats) {
      if (addAll) next.add(cat)
      else next.delete(cat)
    }
    onChange(next)
  }

  const handleExpand = (path: string) => {
    const next = new Set(expanded)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    setExpanded(next)
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
      <div className="filter-tree">
        {tree.map(node => (
          <TreeNodeRow
            key={node.path}
            node={node}
            selected={selected}
            expanded={expanded}
            onToggle={handleToggle}
            onExpand={handleExpand}
            depth={0}
          />
        ))}
      </div>
    </section>
  )
}
