function csvCell(value) {
  // Browsers put narrow/no-break spaces in formatted times ("3:04 PM"); Excel shows them as junk
  const text = String(value ?? '').replace(/[\u202F\u00A0]/g, ' ')
  return `"${text.replace(/"/g, '""')}"`
}

/** CSV text Excel opens cleanly: UTF-8 byte-order mark and CRLF row breaks. */
export function toCsv(rows) {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}

export function downloadCsv(filename, rows) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
