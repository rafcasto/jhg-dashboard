import { useState } from 'react'
import { DEFAULT_SITES } from '../../constants/sites'

function fmtTime(iso) {
  return iso ? new Date(iso).toLocaleString('en-NZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never'
}

const EMPTY = { site_key: 'eec', custom_key: '', label: '', site_url: '', property_id: '', measurement_id: '', service_account: '' }

function GaForm({ initial, onSave, onCancel }) {
  const known = DEFAULT_SITES.some(s => s.key === initial?.site_key)
  const [f, setF] = useState(initial ? {
    site_key:        known ? initial.site_key : 'custom',
    custom_key:      known ? '' : (initial.site_key ?? ''),
    label:           initial.label ?? '',
    site_url:        initial.config?.site_url ?? '',
    property_id:     initial.config?.property_id ?? '',
    measurement_id:  initial.config?.measurement_id ?? '',
    service_account: '',
  } : EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    const siteKey = f.site_key === 'custom' ? f.custom_key.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-') : f.site_key
    const label   = f.label.trim() || DEFAULT_SITES.find(s => s.key === siteKey)?.label || siteKey
    if (!siteKey)        { setError('Give the site a key (e.g. "eec").'); return }
    if (!f.property_id.trim()) { setError('GA4 property ID is required (Admin → Property settings, a number like 123456789).'); return }
    if (!initial && !f.service_account.trim()) { setError('Paste the service-account JSON so the dashboard can read reports.'); return }
    setSaving(true); setError(null)
    try {
      await onSave({
        label, site_key: siteKey,
        config:  { property_id: f.property_id, measurement_id: f.measurement_id, site_url: f.site_url },
        secrets: f.service_account.trim() ? { service_account: f.service_account } : {},
      })
    } catch (err) {
      setError(err.message); setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ border: '1px solid var(--jh-line)', borderRadius: 'var(--radius-md)',
                                     padding: 16, background: 'var(--bg-soft)', marginTop: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
        {initial ? `✏️ Edit ${initial.label}` : '+ Add a Google Analytics property'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Site</label>
          <select className="filter-select" style={{ width: '100%' }} value={f.site_key}
                  onChange={e => set('site_key', e.target.value)}>
            {DEFAULT_SITES.map(s => <option key={s.key} value={s.key}>{s.emoji} {s.label}</option>)}
            <option value="custom">🌐 Other…</option>
          </select>
        </div>
        {f.site_key === 'custom' && (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Site key</label>
            <input className="form-input" placeholder="e.g. blog" value={f.custom_key}
                   onChange={e => set('custom_key', e.target.value)} />
          </div>
        )}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Label</label>
          <input className="form-input" placeholder="e.g. EEC landing page" value={f.label}
                 onChange={e => set('label', e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Site URL</label>
          <input className="form-input" placeholder="https://eec.jobhackers.global" value={f.site_url}
                 onChange={e => set('site_url', e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">GA4 Property ID <span style={{ color: 'var(--jh-red)' }}>*</span></label>
          <input className="form-input" placeholder="123456789" value={f.property_id}
                 onChange={e => set('property_id', e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Measurement ID <span style={{ fontWeight: 400, color: 'var(--fg-3)' }}>(NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID)</span></label>
          <input className="form-input" placeholder="G-XXXXXXXXXX" value={f.measurement_id}
                 onChange={e => set('measurement_id', e.target.value)} />
        </div>
      </div>
      <div className="form-group" style={{ marginTop: 12, marginBottom: 0 }}>
        <label className="form-label">
          Service account JSON {initial && <span style={{ fontWeight: 400, color: 'var(--fg-3)' }}>(leave blank to keep the current one)</span>}
        </label>
        <textarea className="form-input" rows={4} value={f.service_account}
                  placeholder='{ "type": "service_account", "client_email": "...@....iam.gserviceaccount.com", "private_key": "-----BEGIN PRIVATE KEY-----..." }'
                  onChange={e => set('service_account', e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} />
        <p style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 6 }}>
          Google Cloud → IAM → Service accounts → create key (JSON). Enable the <em>Google Analytics Data API</em>,
          then in GA4 → Admin → Property access management add the service-account email as <strong>Viewer</strong>.
          Stored server-side only — never sent to the browser.
        </p>
      </div>
      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" className="chart-toggle-btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="chart-toggle-btn active" disabled={saving}>
          {saving ? 'Saving…' : initial ? '💾 Save changes' : '💾 Add property'}
        </button>
      </div>
    </form>
  )
}

export default function GaSection({ sites, actions, notify }) {
  const [editing, setEditing] = useState(null)   // null | 'new' | integration
  const [busy, setBusy]       = useState({})

  async function save(payload) {
    if (editing === 'new') await actions.createGa4(payload)
    else await actions.update(editing.id, payload)
    setEditing(null)
    notify('ok', 'Google Analytics property saved. Click Sync to pull the last 90 days.')
  }

  async function sync(g) {
    setBusy(b => ({ ...b, [g.id]: true }))
    try {
      const r = await actions.sync(g.id, 90)
      notify('ok', `Synced ${g.label}: ${r.days ?? 0} days of traffic`)
    } catch (e) {
      notify('error', e.message)
    } finally { setBusy(b => ({ ...b, [g.id]: false })) }
  }

  async function remove(g) {
    if (!window.confirm(`Remove "${g.label}"? Its imported traffic data will be deleted.`)) return
    try { await actions.remove(g.id) } catch (e) { notify('error', e.message) }
  }

  const meta = key => DEFAULT_SITES.find(s => s.key === key)

  return (
    <div className="page-section" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 className="page-section-title" style={{ flex: 1, marginBottom: 0, paddingBottom: 0, border: 'none' }}>
          🌐 Google Analytics <span style={{ fontWeight: 400, color: 'var(--fg-3)', fontSize: 13 }}>— downstream sites: EEC, Webinar, Compass…</span>
        </h2>
        <button className="btn-secondary" onClick={() => setEditing('new')}>+ Add property</button>
      </div>
      <div style={{ borderBottom: '1px solid var(--jh-line)', margin: '16px 0' }} />

      {sites.length === 0 ? (
        <div className="empty-state" style={{ padding: 24 }}>
          <p>No GA4 properties yet. Add one per external site so experiments can show sessions,
             users and key events on EEC, the webinar page and the Compass page.</p>
        </div>
      ) : sites.map(g => (
        <div key={g.id} className="integration-row" style={{ padding: '12px 0', borderBottom: '1px solid var(--jh-line)' }}>
          <div className="user-avatar" style={{ fontSize: 18, background: 'var(--bg-tint)' }}>{meta(g.site_key)?.emoji ?? '🌐'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              {g.label} <span className="metric-badge" style={{ marginLeft: 6 }}>{g.site_key}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>
              Property {g.config?.property_id}
              {g.config?.measurement_id && ` · ${g.config.measurement_id}`}
              {g.config?.site_url && <> · <a href={g.config.site_url} target="_blank" rel="noreferrer">{g.config.site_url.replace(/^https?:\/\//, '')}</a></>}
              {' '}· synced {fmtTime(g.last_synced_at)}
              {g.status === 'error' && g.last_error && <span style={{ color: '#b91c1c' }}> · ⚠️ {g.last_error}</span>}
              {g.status === 'pending' && <span style={{ color: '#b45309' }}> · needs a service account</span>}
            </div>
          </div>
          <span className={`role-badge ${g.status === 'connected' ? 'viewer' : 'admin'}`}>{g.status}</span>
          <button className="chart-toggle-btn" disabled={busy[g.id]} onClick={() => sync(g)}>
            {busy[g.id] ? 'Syncing…' : '⟳ Sync'}
          </button>
          <button className="chart-toggle-btn" onClick={() => setEditing(g)}>✏️</button>
          <button className="btn-danger" onClick={() => remove(g)}>Remove</button>
        </div>
      ))}

      {editing && (
        <GaForm initial={editing === 'new' ? null : editing} onSave={save} onCancel={() => setEditing(null)} />
      )}
    </div>
  )
}
