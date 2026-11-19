import { useState } from 'react'

function fmtTime(iso) {
  return iso ? new Date(iso).toLocaleString('en-NZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never'
}

function KitForm({ initial, onSave, onCancel }) {
  const [label, setLabel]   = useState(initial?.label ?? '')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  async function submit(e) {
    e.preventDefault()
    if (!initial && !label.trim()) { setError('Give this Kit account a name (e.g. "JobHackers newsletter").'); return }
    if (!initial && !apiKey.trim()) { setError('Paste the Kit API key.'); return }
    setSaving(true); setError(null)
    try {
      await onSave({
        label:   label.trim() || initial?.label,
        secrets: apiKey.trim() ? { api_key: apiKey.trim() } : {},
      })
    } catch (err) {
      setError(err.message); setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ border: '1px solid var(--jh-line)', borderRadius: 'var(--radius-md)',
                                     padding: 16, background: 'var(--bg-soft)', marginTop: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
        {initial ? `✏️ Edit ${initial.label}` : '+ Connect a Kit account'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Label</label>
          <input className="form-input" placeholder="e.g. JobHackers newsletter" value={label}
                 onChange={e => setLabel(e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">
            Kit API key {initial
              ? <span style={{ fontWeight: 400, color: 'var(--fg-3)' }}>(leave blank to keep the current one)</span>
              : <span style={{ color: 'var(--jh-red)' }}>*</span>}
          </label>
          <input className="form-input" type="password" autoComplete="off" placeholder="kit_…" value={apiKey}
                 onChange={e => setApiKey(e.target.value)} style={{ fontFamily: 'monospace' }} />
        </div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 10 }}>
        Kit → Settings → Developer → <strong>API Keys</strong> (v4). Read access is enough — the dashboard only pulls
        broadcast and sequence stats (emails sent, opens, clicks, unsubscribes). Sequence numbers are snapshotted daily —
        the first sync is the baseline, per-day figures start from the second. Stored server-side only — never sent to the browser.
      </p>
      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" className="chart-toggle-btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="chart-toggle-btn active" disabled={saving}>
          {saving ? (initial ? 'Saving…' : 'Checking key…') : initial ? '💾 Save changes' : '🔗 Connect'}
        </button>
      </div>
    </form>
  )
}

export default function KitSection({ accounts, actions, notify }) {
  const [editing, setEditing] = useState(null)   // null | 'new' | integration
  const [busy, setBusy]       = useState({})

  async function save(payload) {
    if (editing === 'new') {
      const acc = await actions.createKit(payload)
      setEditing(null)
      notify('ok', `Kit account "${acc.label}" connected. Click Sync to pull the last 90 days of broadcasts.`)
    } else {
      await actions.update(editing.id, payload)
      setEditing(null)
      notify('ok', 'Kit account saved.')
    }
  }

  async function sync(acc) {
    setBusy(b => ({ ...b, [acc.id]: true }))
    try {
      const r = await actions.sync(acc.id, 90)
      notify('ok', `Synced ${acc.label}: ${r.broadcasts ?? 0} broadcast${r.broadcasts === 1 ? '' : 's'}, ${r.sequences ?? 0} sequence${r.sequences === 1 ? '' : 's'}`)
    } catch (e) {
      notify('error', e.message)
    } finally { setBusy(b => ({ ...b, [acc.id]: false })) }
  }

  async function remove(acc) {
    if (!window.confirm(`Remove "${acc.label}"? Its imported broadcast stats will be deleted.`)) return
    try { await actions.remove(acc.id) } catch (e) { notify('error', e.message) }
  }

  return (
    <div className="page-section" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 className="page-section-title" style={{ flex: 1, marginBottom: 0, paddingBottom: 0, border: 'none' }}>
          ✉️ Kit email <span style={{ fontWeight: 400, color: 'var(--fg-3)', fontSize: 13 }}>— broadcasts: emails sent, opens, clicks</span>
        </h2>
        <button className="btn-secondary" onClick={() => setEditing('new')}>+ Connect account</button>
      </div>
      <div style={{ borderBottom: '1px solid var(--jh-line)', margin: '16px 0' }} />

      {accounts.length === 0 ? (
        <div className="empty-state" style={{ padding: 24 }}>
          <p>No Kit account yet. Connect one so email campaigns show up as a funnel stage
             (Emails sent → Clicked → Joined the waiting list) and in experiments.</p>
        </div>
      ) : accounts.map(acc => (
        <div key={acc.id} className="integration-row" style={{ padding: '12px 0', borderBottom: '1px solid var(--jh-line)' }}>
          <div className="user-avatar" style={{ fontSize: 18, background: 'var(--bg-tint)' }}>✉️</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{acc.label}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>
              {acc.config?.account_name ?? 'Kit'}
              {acc.config?.account_email && ` · ${acc.config.account_email}`}
              {' '}· synced {fmtTime(acc.last_synced_at)}
              {acc.status === 'error' && acc.last_error && <span style={{ color: '#b91c1c' }}> · ⚠️ {acc.last_error}</span>}
            </div>
          </div>
          <span className={`role-badge ${acc.status === 'connected' ? 'viewer' : 'admin'}`}>{acc.status}</span>
          <button className="chart-toggle-btn" disabled={busy[acc.id]} onClick={() => sync(acc)}>
            {busy[acc.id] ? 'Syncing…' : '⟳ Sync'}
          </button>
          <button className="chart-toggle-btn" onClick={() => setEditing(acc)}>✏️</button>
          <button className="btn-danger" onClick={() => remove(acc)}>Remove</button>
        </div>
      ))}

      {editing && (
        <KitForm initial={editing === 'new' ? null : editing} onSave={save} onCancel={() => setEditing(null)} />
      )}
    </div>
  )
}
