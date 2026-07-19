import { useState } from 'react'
import { fetchLeadsForExport, EXPORT_COLUMNS } from '../lib/exportLeads'
import { toCSV, downloadCSV, slug } from '../utils/csv'

/**
 * A self-contained "Download CSV" button.
 *
 * Fetches the full lead list for the given funnel stage (default or
 * custom), converts it to CSV and triggers a download. Manages its own
 * loading / error state so it can be dropped anywhere.
 *
 * @param {object}   props
 * @param {string}   [props.label='⬇ CSV']   button text
 * @param {string}   props.filename           base filename (without .csv)
 * @param {object}   props.params             passed to fetchLeadsForExport
 *                                            ({ stage, source, startDate, endDate, tags, uniqueByEmail })
 * @param {string}   [props.className='chart-toggle-btn']
 * @param {object}   [props.style]
 * @param {string}   [props.title]
 */
export default function ExportButton({
  label = '⬇ CSV',
  filename,
  params = {},
  className = 'chart-toggle-btn',
  style,
  title,
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleClick() {
    setBusy(true)
    setError(null)
    try {
      const rows = await fetchLeadsForExport(params)
      if (rows.length === 0) {
        setError('No leads to export')
        setTimeout(() => setError(null), 2500)
        return
      }
      const csv = toCSV(rows, EXPORT_COLUMNS)
      const date = new Date().toISOString().slice(0, 10)
      downloadCSV(`${slug(filename)}-${date}.csv`, csv)
    } catch (e) {
      setError(e.message || 'Export failed')
      setTimeout(() => setError(null), 4000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className={className}
      onClick={handleClick}
      disabled={busy}
      title={error || title || 'Download these leads as a CSV file'}
      style={{ whiteSpace: 'nowrap', ...style }}
    >
      {busy ? '…' : error ? '⚠ ' + error : label}
    </button>
  )
}
