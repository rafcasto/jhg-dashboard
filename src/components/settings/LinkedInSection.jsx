import { useState } from 'react'
import CsvImport from './CsvImport'

function fmtTime(iso) {
  return iso ? new Date(iso).toLocaleString('en-NZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never'
}

const isCsvOnly = acc => acc.config?.source === 'csv'

export default function LinkedInSection({ accounts, env, actions, notify }) {
  const [busy, setBusy]           = useState({})
  const [importing, setImporting] = useState(null)
  const configured = env?.linkedin?.client_id && env?.linkedin?.client_secret

  const setB = (id, v) => setBusy(b => ({ ...b, [id]: v }))

  async function addManual() {
    const label = window.prompt('Name for this LinkedIn account (e.g. "Rafael" or "JHG company page")') ?? ''
    if (!label.trim()) return
    try {
      const acc = await actions.createLinkedinManual(label.trim())
      setImporting(acc.id)
      notify('ok', `Added "${acc.label}". Upload LinkedIn's analytics export to fill it with data.`)
    } catch (e) {
      notify('error', e.message)
    }
  }

  async function connect() {
    const label = window.prompt('Label for this LinkedIn account (e.g. "JHG company page")') ?? ''
    try {
      const url = await actions.linkedinAuthUrl(label.trim() || undefined)
      window.location.href = url
    } catch (e) {
      notify('error', e.message)
    }
  }

  async function invite() {
    const label = window.prompt('Whose LinkedIn is this? (e.g. "Sarah")') ?? ''
    if (!label.trim()) return
    try {
      const url = await actions.linkedinInviteUrl(label.trim())
      await navigator.clipboard.writeText(url)
      notify('ok', `Invite link for ${label.trim()} copied — send it to them. They log in to LinkedIn, approve, and their account appears here. Link lasts 7 days.`)
    } catch (e) {
      notify('error', e.message)
    }
  }

  async function sync(acc) {
    setB(acc.id, 'sync')
    try {
      const r = await actions.sync(acc.id, 90)
      notify('ok', `Synced ${acc.label}: ${r.posts ?? 0} posts, ${r.days ?? 0} days of impressions`)
    } catch (e) {
      notify('error', e.message)
    } finally { setB(acc.id, null) }
  }

  async function choosePage(acc, author_urn) {
    setB(acc.id, 'page')
    try { await actions.update(acc.id, { config: { author_urn } }) }
    catch (e) { notify('error', e.message) }
    finally { setB(acc.id, null) }
  }

  async function remove(acc) {
    if (!window.confirm(`Remove "${acc.label}"? Its imported impressions will be deleted.`)) return
    try { await actions.remove(acc.id) } catch (e) { notify('error', e.message) }
  }

  return (
    <div className="page-section" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 className="page-section-title" style={{ flex: 1, marginBottom: 0, paddingBottom: 0, border: 'none' }}>
          👀 LinkedIn accounts <span style={{ fontWeight: 400, color: 'var(--fg-3)', fontSize: 13 }}>— Awareness: impressions &amp; engagement</span>
        </h2>
        <button className="btn-secondary" onClick={addManual}>+ Add account (CSV)</button>
        {configured && (
          <>
            <button className="chart-toggle-btn" onClick={connect} title="Connect your own LinkedIn (requires Community Management API approval)">
              Connect via API
            </button>
            <button className="chart-toggle-btn" onClick={invite} title="Copy a link someone else can open to connect their LinkedIn">
              🔗 Invite someone
            </button>
          </>
        )}
      </div>
      <div style={{ borderBottom: '1px solid var(--jh-line)', margin: '16px 0' }} />

      {accounts.length === 0 ? (
        <div className="empty-state" style={{ padding: 24 }}>
          <p>No LinkedIn accounts yet. Add one per profile or page you post from — each shows up
             as a channel you can attach to an experiment. Then upload LinkedIn's analytics export
             to bring in impressions and engagement.</p>
        </div>
      ) : accounts.map(acc => {
        const orgs   = acc.config?.orgs ?? []
        const manual = isCsvOnly(acc)
        return (
          <div key={acc.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--jh-line)' }}>
            <div className="integration-row">
              <div className="user-avatar" style={{ background: '#ede4f7', color: '#7a1ec2' }}>in</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {acc.label}
                  {acc.config?.member_name && acc.config.member_name !== acc.label && (
                    <span style={{ color: 'var(--fg-3)', fontWeight: 400 }}> · {acc.config.member_name}</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>
                  {manual ? 'Last import' : 'Last synced'} {fmtTime(acc.last_synced_at)}
                  {acc.status === 'error' && acc.last_error && (
                    <span style={{ color: '#b91c1c' }}> · ⚠️ {acc.last_error}</span>
                  )}
                </div>
              </div>

              {!manual && (
                <select className="filter-select" value={acc.config?.author_urn ?? ''}
                        disabled={busy[acc.id] === 'page'}
                        onChange={e => choosePage(acc, e.target.value)}
                        title="Which LinkedIn page's analytics this account reports on">
                  <option value="">Choose page…</option>
                  {orgs.map(o => <option key={o.urn} value={o.urn}>🏢 {o.name}</option>)}
                  {acc.config?.member_urn && (
                    <option value={acc.config.member_urn}>👤 Personal profile</option>
                  )}
                </select>
              )}

              <span className={`role-badge ${acc.status === 'connected' ? 'viewer' : 'admin'}`}>
                {manual ? 'csv' : acc.status}
              </span>
              {!manual && (
                <button className="chart-toggle-btn" disabled={busy[acc.id] === 'sync'} onClick={() => sync(acc)}>
                  {busy[acc.id] === 'sync' ? 'Syncing…' : '⟳ Sync'}
                </button>
              )}
              <button className={`chart-toggle-btn${manual ? ' active' : ''}`}
                      onClick={() => setImporting(importing === acc.id ? null : acc.id)}>
                📥 Import CSV
              </button>
              <button className="btn-danger" onClick={() => remove(acc)}>Remove</button>
            </div>
            {importing === acc.id && (
              <CsvImport integration={acc} onImport={actions.importCsv} onClose={() => setImporting(null)} />
            )}
          </div>
        )
      })}

      <p style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 12 }}>
        <strong>CSV</strong> accounts take LinkedIn's own analytics export (Analytics → <em>Export</em>) —
        works today for personal profiles and company pages. <strong>API</strong> accounts sync nightly
        (daily impressions, reactions, comments, reposts for your own posts; full stats for company pages)
        once LinkedIn approves the <em>Community Management API</em> product on the developer
        app{configured ? '' : ' (not configured)'}. Importing a CSV into an API account also lets the
        sync refresh per-post numbers for those posts.
      </p>
    </div>
  )
}
