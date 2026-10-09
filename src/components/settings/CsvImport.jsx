import { useState } from 'react'
import { parseCSV } from '../../utils/csv'
import { detectLinkedinCsv } from '../../lib/linkedinCsv'

/**
 * Manual upload of LinkedIn's analytics export for an account
 * (personal profiles have no analytics API). Expects CSV —
 * open LinkedIn's .xlsx export and "Save as CSV" first.
 */
export default function CsvImport({ integration, onImport, onClose }) {
  const [parsed, setParsed]   = useState(null)
  const [error, setError]     = useState(null)
  const [busy, setBusy]       = useState(false)
  const [result, setResult]   = useState(null)

  async function handleFile(e) {
    setError(null); setResult(null); setParsed(null)
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      setParsed(detectLinkedinCsv(parseCSV(text)))
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleImport() {
    if (!parsed) return
    setBusy(true); setError(null)
    try {
      const body = parsed.mode === 'posts' ? { posts: parsed.records } : { daily: parsed.records }
      const r = await onImport(integration.id, body)
      setResult(r)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ border: '1px solid var(--jh-line)', borderRadius: 'var(--radius-md)',
                  padding: 16, marginTop: 10, background: 'var(--bg-soft)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <strong style={{ fontSize: 13 }}>📥 Import LinkedIn analytics for “{integration.label}”</strong>
        <div style={{ flex: 1 }} />
        <button className="chart-toggle-btn" onClick={onClose}>Close</button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 10 }}>
        LinkedIn → Analytics → Post analytics → <em>Export</em>. Open the .xlsx and save the
        “Top posts” sheet (per-post) or the “Discovery” sheet (per-day impressions) as CSV, then upload it here.
      </p>
      <input type="file" accept=".csv,text/csv" onChange={handleFile} style={{ fontSize: 13 }} />

      {error && <div className="form-error" style={{ marginTop: 10 }}>{error}</div>}

      {parsed && (
        <div style={{ marginTop: 12, fontSize: 13 }}>
          <div>
            Detected <strong>{parsed.mode === 'posts' ? 'per-post' : 'per-day'}</strong> layout ·{' '}
            <strong>{parsed.records.length}</strong> rows
            {parsed.records[0] && (
              <span style={{ color: 'var(--fg-3)' }}>
                {' '}· first: {parsed.records[0].published_at ?? parsed.records[0].date} —{' '}
                {parsed.records[0].impressions || 0} impressions
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
            <button className="chart-toggle-btn active" disabled={busy || !parsed.records.length}
                    onClick={handleImport}>
              {busy ? 'Importing…' : `Import ${parsed.records.length} rows`}
            </button>
            {result && (
              <span style={{ color: '#166534', fontWeight: 600 }}>
                ✅ Imported {result.posts} posts, {result.daily} days
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
