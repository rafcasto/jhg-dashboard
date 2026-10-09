import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useIntegrations } from '../hooks/useIntegrations'
import { apiFetch } from '../lib/api'
import LinkedInSection from '../components/settings/LinkedInSection'
import GaSection from '../components/settings/GaSection'

export default function SettingsPage() {
  const { role } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const integ = useIntegrations()
  const [env, setEnv]     = useState(null)
  const [flash, setFlash] = useState(null)
  const [syncingAll, setSyncingAll] = useState(false)

  useEffect(() => {
    if (role !== null && role !== 'admin') navigate('/')
  }, [role, navigate])

  useEffect(() => {
    if (role === 'admin') apiFetch('/api/integrations/env-status').then(setEnv).catch(() => setEnv({}))
  }, [role])

  // Landing back from LinkedIn OAuth
  useEffect(() => {
    const li = params.get('linkedin')
    if (!li) return
    if (li === 'connected') setFlash({ type: 'ok', msg: '✅ LinkedIn account connected. Pick the page it reports on, then Sync.' })
    else setFlash({ type: 'error', msg: `LinkedIn connection failed: ${params.get('msg') ?? 'unknown error'}` })
    setParams({}, { replace: true })
    integ.refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const notify = (type, msg) => {
    setFlash({ type, msg })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function syncAll() {
    setSyncingAll(true)
    const results = []
    for (const i of integ.integrations) {
      try { await integ.sync(i.id, 90); results.push(`✅ ${i.label}`) }
      catch (e) { results.push(`⚠️ ${i.label}: ${e.message}`) }
    }
    setSyncingAll(false)
    notify(results.some(r => r.startsWith('⚠️')) ? 'error' : 'ok', results.join(' · ') || 'Nothing to sync yet')
  }

  if (role === null) return <div className="spinner-wrap"><div className="spinner" /></div>

  return (
    <div>
      <div className="page-header">
        <h1>⚙️ Settings</h1>
        <p>Connect the systems the dashboard reads from — LinkedIn for awareness, Google Analytics for downstream sites</p>
      </div>

      {flash && (
        <div className={flash.type === 'ok' ? 'alert-success' : 'form-error'}
             style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ flex: 1 }}>{flash.msg}</span>
          <button className="chart-toggle-btn" onClick={() => setFlash(null)}>✕</button>
        </div>
      )}
      {integ.error && <div className="form-error">{integ.error}</div>}

      <LinkedInSection accounts={integ.linkedin} env={env} actions={integ} notify={notify} />
      <GaSection sites={integ.ga4} actions={integ} notify={notify} />

      <div className="page-section">
        <h2 className="page-section-title">🔁 Automation</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, fontSize: 13, color: 'var(--fg-2)' }}>
            A Vercel cron refreshes every connected system daily at 03:00 UTC (last 14 days).
            {env && (
              env.cron?.secret
                ? <span style={{ color: '#166534' }}> ✅ CRON_SECRET is set.</span>
                : <span style={{ color: '#b45309' }}> ⚠️ Set <code>CRON_SECRET</code> in Vercel to enable it.</span>
            )}
            {env?.app_url && <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 4 }}>App URL: {env.app_url}</div>}
          </div>
          <button className="btn-secondary" disabled={syncingAll || integ.integrations.length === 0} onClick={syncAll}>
            {syncingAll ? 'Syncing…' : '⟳ Sync everything now (90 days)'}
          </button>
        </div>
      </div>
    </div>
  )
}
