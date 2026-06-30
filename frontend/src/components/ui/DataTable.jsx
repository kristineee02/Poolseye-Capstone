import './DataTable.css'
import { Icon } from './Icon'
import { useState } from 'react'

export function DataTable({ columns, data, sortBy, onSort, isLoading = false, emptyMessage = 'No data available' }) {
  const [sortConfig, setSortConfig] = useState(sortBy || { key: null, direction: 'asc' })

  const handleSort = (columnKey) => {
    const isAsc = sortConfig.key === columnKey && sortConfig.direction === 'asc'
    const newConfig = { key: columnKey, direction: isAsc ? 'desc' : 'asc' }
    setSortConfig(newConfig)
    onSort?.(newConfig)
  }

  const getSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) return null
    return sortConfig.direction === 'asc' ? <Icon.ChevronUp /> : <Icon.ChevronDown />
  }

  if (isLoading) {
    return (
      <div className="data-table loading">
        <div className="loading-spinner" />
        <p>Loading data...</p>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="data-table empty">
        <div className="empty-state-icon">
          <Icon.Database />
        </div>
        <p>{emptyMessage}</p>
      </div>
    )
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key} onClick={() => col.sortable && handleSort(col.key)} className={col.sortable ? 'sortable' : ''}>
              <div className="th-content">
                <span>{col.label}</span>
                {col.sortable && getSortIcon(col.key)}
              </div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, rowIdx) => (
          <tr key={rowIdx}>
            {columns.map((col) => (
              <td key={`${rowIdx}-${col.key}`} className={col.className || ''}>
                {col.render ? col.render(row) : row[col.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
