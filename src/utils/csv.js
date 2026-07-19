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
