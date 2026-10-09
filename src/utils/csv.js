// ============================================================
// CSV helpers — build an RFC-4180-ish CSV string and trigger a
// browser download. No dependencies.
// ============================================================

/** Escape a single value for CSV (quote when it contains , " or newline). */
function escapeCell(value) {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Turn an array of row objects into a CSV string.
 *
 * @param {object[]} rows
 * @param {{ key: string, label: string, format?: (v, row) => any }[]} columns
 */
export function toCSV(rows, columns) {
  const header = columns.map(c => escapeCell(c.label)).join(',')
  const body = (rows ?? []).map(row =>
    columns
      .map(c => {
        const raw = row[c.key]
        return escapeCell(c.format ? c.format(raw, row) : raw)
      })
      .join(',')
  )
  return [header, ...body].join('\r\n')
}

/** Trigger a client-side download of `content` as `filename`. */
export function downloadCSV(filename, content) {
  // Prepend a UTF-8 BOM so Excel opens accented characters correctly.
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Slugify a label into a safe filename fragment. */
export function slug(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'leads'
}

/** Parse CSV text into rows of cells (handles quotes, CRLF, BOM). Blank rows dropped. */
export function parseCSV(text) {
  const rows = []
  let row = [], cell = '', inQ = false
  const s = String(text ?? '').replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++ } else inQ = false
      } else cell += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(x => x.trim() !== ''))
}
