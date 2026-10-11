import { useState } from 'react'
import { parseCSV } from '../../utils/csv'
import { readXlsx } from '../../utils/xlsx'
import { detectLinkedinCsv } from '../../lib/linkedinCsv'
import { parseLinkedinWorkbook } from '../../lib/linkedinXlsx'

/**
 * Manual upload of LinkedIn's analytics export for an account
 * (personal profiles have no analytics API). Takes the .xlsx
 * LinkedIn hands out directly — both the single-post and the
 * aggregate (date-range) export — or a CSV saved from one.
 */
export default function CsvImport({ integration, onImport, onClose }) {
  const [parsed, setParsed]   = useState(null)   // { posts, daily, notes }
  const [error, setError]     = useState(null)
  const [busy, setBusy]       = useState(false)
  const [result, setResult]   = useState(null)

  async function handleFile(e) {
    setError(null); setResult(null); setParsed(null)
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const head = new Uint8Array(await file.slice(0, 2).arrayBuffer())
      const isZip = head[0] === 0x50 && head[1] === 0x4b              // "PK" — .xlsx is a zip
      if (isZip || /\.xlsx$/i.test(file.name)) {
        setParsed(parseLinkedinWorkbook(await readXlsx(file)))
      } else {
        const d = detectLinkedinCsv(parseCSV(await file.text()))
        setParsed(d.mode === 'posts'
          ? { posts: d.records, daily: [], notes: [`CSV: ${d.records.length} posts`] }
          : { posts: [], daily: d.records, notes: [`CSV: ${d.records.length} days`] })
      }
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleImport() {
    if (!parsed) return
    setBusy(true); setError(null)
    try {
      const r = await onImport(integration.id, { posts: parsed.posts, daily: parsed.daily })
      setResult(r)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const total = parsed ? parsed.posts.length + parsed.daily.length : 0
  const first = parsed?.posts[0] ?? parsed?.daily[0]

  return (
    <div style={{ border: '1px solid var(--jh-line)', borderRadius: 'var(--radius-md)',
                  padding: 16, marginTop: 10, background: 'var(--bg-soft)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <strong style={{ fontSize: 13 }}>📥 Import LinkedIn analytics for “{integration.label}”</strong>
        <div style={{ flex: 1 }} />
        <button className="chart-toggle-btn" onClick={onClose}>Close</button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 10 }}>
        <strong>Personal profile:</strong> Analytics &amp; tools → Post impressions → <em>Export</em>{' '}
        (per-day impressions + top posts), or open a post → <em>View analytics</em> → <em>Export</em>{' '}
        (one post, full detail).{' '}
        <strong>Company page:</strong> Page → Analytics → Content → <em>Export</em>.
        Upload the <code>.xlsx</code> LinkedIn gives you as-is — no need to convert it.
      </p>
      <input type="file"
             accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
             onChange={handleFile} style={{ fontSize: 13 }} />

      {error && <div className="form-error" style={{ marginTop: 10 }}>{error}</div>}

      {parsed && (
        <div style={{ marginTop: 12, fontSize: 13 }}>
          <div>
            Found <strong>{parsed.posts.length}</strong> posts · <strong>{parsed.daily.length}</strong> days
            {first && (
              <span style={{ color: 'var(--fg-3)' }}>
                {' '}· first: {first.title ?? first.published_at ?? first.date} —{' '}
                {first.impressions || 0} impressions
              </span>
            )}
          </div>
          {parsed.notes.length > 0 && (
            <div style={{ color: 'var(--fg-3)', fontSize: 12, marginTop: 4 }}>{parsed.notes.join(' · ')}</div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
            <button className="chart-toggle-btn active" disabled={busy || !total}
                    onClick={handleImport}>
              {busy ? 'Importing…' : `Import ${total} rows`}
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
