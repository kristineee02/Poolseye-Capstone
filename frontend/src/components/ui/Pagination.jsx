import { useMemo } from 'react'
import { Icon } from './Icon'
import './Pagination.css'

export default function Pagination({
  page,
  totalPages,
  onPageChange,
  summary,
  className = '',
}) {
  const safeTotal = Math.max(1, totalPages)
  const current = Math.min(Math.max(1, page), safeTotal)

  const pages = useMemo(() => {
    const list = []
    for (let i = 1; i <= safeTotal; i += 1) list.push(i)
    return list
  }, [safeTotal])

  if (safeTotal <= 1 && !summary) return null

  return (
    <div className={`ui-pagination ${className}`.trim()} aria-label="Pagination">
      {summary ? <span className="ui-pagination-summary">{summary}</span> : <span />}
      {safeTotal > 1 ? (
        <div className="ui-page-btns">
          <button
            type="button"
            className="ui-page-btn ui-page-nav"
            disabled={current <= 1}
            onClick={() => onPageChange(current - 1)}
            aria-label="Previous page"
          >
            <Icon.ChevronLeft />
          </button>
          {pages.map((n) => (
            <button
              key={n}
              type="button"
              className={`ui-page-btn ${n === current ? 'active' : ''}`}
              onClick={() => onPageChange(n)}
              aria-current={n === current ? 'page' : undefined}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            className="ui-page-btn ui-page-nav"
            disabled={current >= safeTotal}
            onClick={() => onPageChange(current + 1)}
            aria-label="Next page"
          >
            <Icon.ChevronRight />
          </button>
        </div>
      ) : null}
    </div>
  )
}
