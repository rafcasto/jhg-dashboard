import { useState, useMemo } from 'react'
import { STAGE_MAP } from '../constants/stages'
import { INTENT_BANDS, intentBand } from '../constants/intent'
import { useIntentScoring, useIntentDistribution, useDecayRules } from '../hooks/useIntentScoring'

// churn isn't in STAGES (it's not a pirate metric) — give it a look here
const CHURN_META = { label: 'Churn', emoji: '🪦', color: '#dc2626' }
const stageMeta = key => STAGE_MAP[key] ?? (key === 'churn' ? CHURN_META : { label: key, emoji: '•', color: 'var(--fg-3)' })

function weightColor(w) {
  if (w < 0) return '#dc2626'
  if (w === 0) return 'var(--fg-4)'
  return '#16a34a'
}

const fmtWeight = w => (w > 0 ? `+${w}` : String(w))

// Leads with no tag at all aren't a scoring gap — there's nothing to score.
const UNTAGGED = '(untagged)'

/** A tag is "unscored" when no rule matches it, so it contributes 0 points. */
export function isUnscored(tag) {
  return tag.tag !== UNTAGGED && (tag.matched_rules ?? []).length === 0
}

// ============================================================
// Unscored-tag alert — catches new tags that silently score 0
// ============================================================
function UnscoredBanner({ tags, onReview }) {
  const unscored = tags.filter(isUnscored)
  if (unscored.length === 0) return null

  const leads = unscored.reduce((a, t) => a + t.lead_count, 0)
  const preview = unscored.slice(0, 3).map(t => t.tag)

  return (
    <div style={{
      border: '1px solid #f0a81c',
      borderLeft: '4px solid #f0a81c',
      background: 'rgba(240,168,28,0.08)',
      borderRadius: 'var(--radius-md)',
      padding: '14px 18px',
      marginBottom: 20,
      display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 320 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
          ⚠️ {unscored.length} tag{unscored.length === 1 ? '' : 's'} {unscored.length === 1 ? 'is' : 'are'} unscored
          {' '}— covering {leads.toLocaleString()} lead{leads === 1 ? '' : 's'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--fg-2)', lineHeight: 1.45 }}>
          No rule matches {unscored.length === 1 ? 'it' : 'them'}, so {unscored.length === 1 ? 'it adds' : 'they add'} 0
          points. These leads still score from their stage — but if one of these is a
          high-intent action, you’re under-scoring it.
          <div style={{
            fontFamily: 'var(--font-mono, monospace)', fontSize: 11,
            color: 'var(--fg-3)', marginTop: 6,
          }}>
            {preview.join(' · ')}{unscored.length > 3 ? ` · +${unscored.length - 3} more` : ''}
          </div>
        </div>
      </div>
      <button className="chart-toggle-btn active" onClick={onReview}>
        Review {unscored.length === 1 ? 'it' : 'them'} →
      </button>
    </div>
  )
}

// ============================================================
// Band legend — what the numbers mean
// ============================================================
function BandLegend({ distribution }) {
  const counts = Object.fromEntries((distribution ?? []).map(d => [d.band, d.lead_count]))
  const total  = (distribution ?? []).reduce((a, d) => a + d.lead_count, 0)

  return (
    <div className="chart-section" style={{ marginBottom: 20 }}>
      <div className="chart-section-header">
        <h2 className="chart-section-title">
          Intent bands
          <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--fg-3)', marginTop: 4 }}>
            Where your {total.toLocaleString()} leads sit right now — updates the moment you change a weight
          </span>
        </h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${INTENT_BANDS.length}, 1fr)`, gap: 12 }}>
        {INTENT_BANDS.map(b => {
          const n   = counts[b.key] ?? 0
          const pct = total > 0 ? Math.round((n / total) * 100) : 0
          return (
            <div key={b.key} style={{
              border: '1px solid var(--jh-line)', borderRadius: 'var(--radius-md)',
              padding: '12px 14px', borderTop: `3px solid ${b.color}`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: b.color, marginBottom: 2 }}>
                {b.emoji} {b.label}
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-4)', marginBottom: 6 }}>
                {b.min === -Infinity ? '< 0' : b.max === Infinity ? `${b.min}+` : `${b.min}–${b.max}`}
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22 }}>
                {n.toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>{pct}% of base</div>
              <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 6, lineHeight: 1.35 }}>
                {b.description}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// Stage weights — base intent from funnel progression
// ============================================================
function StageWeights({ stages, saveStageWeights }) {
  const [editing, setEditing] = useState(false)
  const [drafts, setDrafts]   = useState({})
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)

  function startEdit() {
    setDrafts(Object.fromEntries(stages.map(s => [s.stage_key, String(s.weight)])))
    setEditing(true)
    setError(null)
  }

  async function handleSave() {
    setSaving(true); setError(null)
    try {
      await saveStageWeights(stages.map(s => ({
        stage_key: s.stage_key,
        weight:    parseInt(drafts[s.stage_key] || '0', 10) || 0,
      })))
      setEditing(false)
    } catch (e) { setError(e.message) }
    setSaving(false)
  }

  return (
    <div className="chart-section" style={{ marginBottom: 20 }}>
      <div className="chart-section-header">
        <h2 className="chart-section-title">
          1 · Stage weights
          <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--fg-3)', marginTop: 4 }}>
            Base points a lead earns just for reaching a stage. Churn is always forced negative.
          </span>
        </h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {error && <span style={{ color: '#dc2626', fontSize: 13 }}>{error}</span>}
          {editing ? (
            <>
              <button className="chart-toggle-btn" onClick={() => setEditing(false)}>Cancel</button>
              <button className="chart-toggle-btn active" disabled={saving} onClick={handleSave}>
                {saving ? 'Saving…' : '💾 Save weights'}
              </button>
            </>
          ) : (
            <button className="chart-toggle-btn active" onClick={startEdit}>✏️ Edit weights</button>
          )}
        </div>
      </div>

      <div style={{ border: '1px solid var(--jh-line)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        {stages.map(s => {
          const meta = stageMeta(s.stage_key)
          const isChurn = s.stage_key === 'churn'
          return (
            <div key={s.stage_key} style={{
              display: 'grid', gridTemplateColumns: '220px 1fr 120px 140px',
              gap: 16, alignItems: 'center', padding: '12px 16px',
              borderBottom: '1px solid var(--jh-line)',
              background: isChurn ? 'rgba(220,38,38,0.04)' : undefined,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>{meta.emoji}</span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: meta.color }}>
                  {meta.label}
                </span>
              </div>

              <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>
                {isChurn
                  ? 'Always resolves negative, whatever the tags add.'
                  : `Always resolves ≥ 0.`}
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                  Leads
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>
                  {s.lead_count.toLocaleString()}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                  Points
                </div>
                {editing ? (
                  <input
                    type="number" className="filter-input"
                    value={drafts[s.stage_key] ?? ''}
                    onChange={e => setDrafts(d => ({ ...d, [s.stage_key]: e.target.value }))}
                    style={{ width: 100, textAlign: 'right' }}
                  />
                ) : (
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: weightColor(s.weight) }}>
                    {fmtWeight(s.weight)}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// Tag weights — every live tag, with inline override
// ============================================================
function TagWeights({ tags, setTagWeight, clearTagWeight, onlyUnscored, setOnlyUnscored }) {
  const [query, setQuery]     = useState('')
  const [editKey, setEditKey] = useState(null)
  const [draft, setDraft]     = useState('')
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState(null)

  const unscoredCount = useMemo(() => tags.filter(isUnscored).length, [tags])

  const filtered = useMemo(() => {
    let list = tags
    if (onlyUnscored) list = list.filter(isUnscored)
    const q = query.trim().toUpperCase()
    if (q) list = list.filter(t => t.tag.includes(q))
    return list
  }, [tags, query, onlyUnscored])

  async function commit(tag) {
    setBusy(true); setError(null)
    try {
      await setTagWeight(tag.tag, parseInt(draft || '0', 10) || 0, tag.tag)
      setEditKey(null)
    } catch (e) { setError(e.message) }
    setBusy(false)
  }

  async function reset(tag) {
    setBusy(true); setError(null)
    try { await clearTagWeight(tag.tag); setEditKey(null) }
    catch (e) { setError(e.message) }
    setBusy(false)
  }

  return (
    <div className="chart-section" style={{ marginBottom: 20 }} id="tag-weights">
      <div className="chart-section-header">
        <h2 className="chart-section-title">
          2 · Tag weights
          <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--fg-3)', marginTop: 4 }}>
            Every tag in your base. Setting a weight here pins that exact tag, overriding any pattern rule below.
          </span>
        </h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {unscoredCount > 0 && (
            <button
              className={`chart-toggle-btn${onlyUnscored ? ' active' : ''}`}
              onClick={() => setOnlyUnscored(v => !v)}
              title="Show only tags that no rule matches"
            >
              ⚠️ Unscored ({unscoredCount})
            </button>
          )}
          <input
            type="text" className="filter-input" placeholder="Filter tags…"
            value={query} onChange={e => setQuery(e.target.value)} style={{ width: 200 }}
          />
        </div>
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 10 }}>{error}</div>}

      {onlyUnscored && (
        <div style={{ fontSize: 12, color: 'var(--fg-2)', marginBottom: 10 }}>
          Showing only unscored tags. Give each one a weight below, or add a wildcard rule in
          section 3 so future variants score automatically.
          {' '}
          <button
            onClick={() => setOnlyUnscored(false)}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              color: 'var(--jh-accent, #0033cc)', fontSize: 12, textDecoration: 'underline',
            }}
          >
            Show all tags
          </button>
        </div>
      )}

      <div style={{ border: '1px solid var(--jh-line)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 90px 220px 150px',
          gap: 16, padding: '10px 16px', background: 'var(--bg-soft)',
          fontSize: 11, fontWeight: 700, letterSpacing: '0.5px',
          textTransform: 'uppercase', color: 'var(--fg-3)',
        }}>
          <div>Tag</div>
          <div style={{ textAlign: 'right' }}>Leads</div>
          <div>Scored by</div>
          <div style={{ textAlign: 'right' }}>Points</div>
        </div>

        {filtered.length === 0 && (
          <div className="empty-state">
            <p>{onlyUnscored ? 'Every tag is scored. 🎉' : `No tags match “${query}”.`}</p>
          </div>
        )}

        {filtered.map(tag => {
          const rules       = tag.matched_rules ?? []
          const isExact     = rules.some(r => r.match_type === 'exact')
          const unscored    = isUnscored(tag)
          const editingThis = editKey === tag.tag

          return (
            <div key={tag.tag} style={{
              display: 'grid', gridTemplateColumns: '1fr 90px 220px 150px',
              gap: 16, alignItems: 'center', padding: '12px 16px',
              borderBottom: '1px solid var(--jh-line)',
              background: unscored ? 'rgba(240,168,28,0.07)' : undefined,
            }}>
              <div style={{
                fontFamily: 'var(--font-mono, monospace)', fontSize: 12,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }} title={tag.tag}>
                {unscored && <span title="No rule matches this tag">⚠️ </span>}
                {tag.tag}
              </div>

              <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 14 }}>
                {tag.lead_count.toLocaleString()}
              </div>

              <div style={{ fontSize: 11, color: 'var(--fg-3)', lineHeight: 1.4 }}>
                {tag.tag === UNTAGGED ? (
                  <span style={{ color: 'var(--fg-4)' }}>no tag — stage score only</span>
                ) : unscored ? (
                  <span style={{ color: '#b45309', fontWeight: 700 }}>no rule — worth 0</span>
                ) : isExact ? (
                  <span style={{ color: '#7a1ec2', fontWeight: 700 }}>📌 pinned override</span>
                ) : (
                  rules.map(r => `${r.label} (${fmtWeight(r.weight)})`).join(' + ')
                )}
              </div>

              <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                {editingThis ? (
                  <>
                    <input
                      type="number" className="filter-input" autoFocus
                      value={draft} onChange={e => setDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') commit(tag); if (e.key === 'Escape') setEditKey(null) }}
                      style={{ width: 70, textAlign: 'right' }}
                    />
                    <button className="chart-toggle-btn active" disabled={busy} onClick={() => commit(tag)} title="Save">✓</button>
                    <button className="chart-toggle-btn" onClick={() => setEditKey(null)} title="Cancel">✕</button>
                  </>
                ) : (
                  <>
                    <span style={{
                      fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18,
                      color: weightColor(tag.weight), minWidth: 44, textAlign: 'right',
                    }}>
                      {fmtWeight(tag.weight)}
                    </span>
                    <button
                      className={`chart-toggle-btn${unscored ? ' active' : ''}`}
                      onClick={() => { setEditKey(tag.tag); setDraft(String(tag.weight)) }}
                      title={unscored ? 'Give this tag a weight' : 'Pin a weight for this exact tag'}
                      disabled={tag.tag === UNTAGGED}
                    >✏️</button>
                    {isExact && (
                      <button
                        className="chart-toggle-btn" disabled={busy}
                        onClick={() => reset(tag)}
                        title="Remove the override and fall back to pattern rules"
                      >↺</button>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// Pattern rules — catch future tags automatically
// ============================================================
const BLANK_RULE = { label: '', pattern: '', match_type: 'like', weight: 0, enabled: true }

function PatternRules({ rules, saveRule, deleteRule }) {
  const [editing, setEditing] = useState(null)
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState(null)

  const likeRules  = rules.filter(r => r.match_type === 'like')
  const exactRules = rules.filter(r => r.match_type === 'exact')

  async function commit() {
    if (!editing.label.trim())   { setError('Give the rule a name.'); return }
    if (!editing.pattern.trim()) { setError('Set a pattern, e.g. %->RSVP->%'); return }
    setBusy(true); setError(null)
    try {
      await saveRule({
        ...editing,
        label:   editing.label.trim(),
        pattern: editing.pattern.trim().toUpperCase(),
        weight:  parseInt(editing.weight || '0', 10) || 0,
      })
      setEditing(null)
    } catch (e) { setError(e.message) }
    setBusy(false)
  }

  async function remove(rule) {
    if (!window.confirm(`Delete rule "${rule.label}"?`)) return
    setBusy(true); setError(null)
    try { await deleteRule(rule.id) } catch (e) { setError(e.message) }
    setBusy(false)
  }

  return (
    <div className="chart-section">
      <div className="chart-section-header">
        <h2 className="chart-section-title">
          3 · Pattern rules
          <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--fg-3)', marginTop: 4 }}>
            Match tags by wildcard so new tags score automatically. All matching patterns sum together.
          </span>
        </h2>
        {!editing && (
          <button className="chart-toggle-btn active" onClick={() => setEditing({ ...BLANK_RULE })}>
            + New rule
          </button>
        )}
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 10 }}>{error}</div>}

      {editing && (
        <div style={{
          border: '1px solid var(--jh-line)', borderRadius: 'var(--radius-md)',
          padding: 16, marginBottom: 16, background: 'var(--bg-soft)',
        }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="filter-group">
              <label className="filter-label">Rule name</label>
              <input type="text" className="filter-input" placeholder="e.g. Booked a call"
                value={editing.label} onChange={e => setEditing(r => ({ ...r, label: e.target.value }))}
                style={{ width: 220 }} />
            </div>
            <div className="filter-group">
              <label className="filter-label">Pattern (% = wildcard)</label>
              <input type="text" className="filter-input" placeholder="%->BOOKED_CALL->%"
                value={editing.pattern} onChange={e => setEditing(r => ({ ...r, pattern: e.target.value }))}
                style={{ width: 260, fontFamily: 'var(--font-mono, monospace)' }} />
            </div>
            <div className="filter-group">
              <label className="filter-label">Points</label>
              <input type="number" className="filter-input"
                value={editing.weight} onChange={e => setEditing(r => ({ ...r, weight: e.target.value }))}
                style={{ width: 90, textAlign: 'right' }} />
            </div>
            <div className="filter-group">
              <label className="filter-label">Enabled</label>
              <input type="checkbox" checked={editing.enabled}
                onChange={e => setEditing(r => ({ ...r, enabled: e.target.checked }))}
                style={{ width: 18, height: 18 }} />
            </div>
            <div style={{ flex: 1 }} />
            <button className="chart-toggle-btn" onClick={() => setEditing(null)}>Cancel</button>
            <button className="chart-toggle-btn active" disabled={busy} onClick={commit}>
              {busy ? 'Saving…' : '💾 Save rule'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 10, lineHeight: 1.5 }}>
            Patterns match the <strong>normalised</strong> tag — uppercased with arrows tightened, so
            <code style={{ margin: '0 4px' }}>EVENT -&gt; RSVP -&gt; WEBINAR</code> becomes
            <code style={{ margin: '0 4px' }}>EVENT-&gt;RSVP-&gt;WEBINAR</code>.
            <br />
            <code>%-&gt;ACTION-&gt;%</code> needs a segment after the action. If your tag ends at the
            action, use <code>%-&gt;ACTION%</code> instead.
          </div>
        </div>
      )}

      <div style={{ border: '1px solid var(--jh-line)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 260px 90px 120px',
          gap: 16, padding: '10px 16px', background: 'var(--bg-soft)',
          fontSize: 11, fontWeight: 700, letterSpacing: '0.5px',
          textTransform: 'uppercase', color: 'var(--fg-3)',
        }}>
          <div>Rule</div><div>Pattern</div>
          <div style={{ textAlign: 'right' }}>Points</div>
          <div style={{ textAlign: 'right' }}>Actions</div>
        </div>

        {likeRules.map(r => (
          <div key={r.id} style={{
            display: 'grid', gridTemplateColumns: '1fr 260px 90px 120px',
            gap: 16, alignItems: 'center', padding: '10px 16px',
            borderBottom: '1px solid var(--jh-line)', opacity: r.enabled ? 1 : 0.45,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {r.label}{!r.enabled && <span style={{ fontSize: 11, color: 'var(--fg-4)' }}> · disabled</span>}
            </div>
            <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: 'var(--fg-3)' }}>
              {r.pattern}
            </div>
            <div style={{ textAlign: 'right', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, color: weightColor(r.weight) }}>
              {fmtWeight(r.weight)}
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button className="chart-toggle-btn" onClick={() => setEditing({ ...r, weight: String(r.weight) })}>✏️</button>
              <button className="chart-toggle-btn" disabled={busy} onClick={() => remove(r)}>🗑</button>
            </div>
          </div>
        ))}
      </div>

      {exactRules.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--fg-3)' }}>
          📌 {exactRules.length} pinned tag override{exactRules.length === 1 ? '' : 's'} active —
          manage those inline in the Tag weights table above.
        </div>
      )}
    </div>
  )
}

// ============================================================
// Inactivity decay — intent is perishable
// ============================================================
const BLANK_TIER = { label: '', min_months: 3, penalty: -10, enabled: true }

function DecaySection() {
  const { rules, loading, saveRule, deleteRule } = useDecayRules()
  const [editing, setEditing] = useState(null)
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState(null)

  async function commit() {
    if (!editing.label.trim())            { setError('Name the tier.'); return }
    if (Number(editing.min_months) <= 0)  { setError('Months must be greater than 0.'); return }
    if (Number(editing.penalty)   >  0)   { setError('Penalty must be 0 or negative.'); return }
    setBusy(true); setError(null)
    try {
      await saveRule({ ...editing, label: editing.label.trim() })
      setEditing(null)
    } catch (e) { setError(e.message) }
    setBusy(false)
  }

  async function remove(r) {
    if (!window.confirm(`Delete the "${r.label}" tier?`)) return
    setBusy(true); setError(null)
    try { await deleteRule(r.id) } catch (e) { setError(e.message) }
    setBusy(false)
  }

  return (
    <div className="chart-section" style={{ marginTop: 20 }}>
      <div className="chart-section-header">
        <h2 className="chart-section-title">
          4 · Inactivity decay
          <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--fg-3)', marginTop: 4 }}>
            Points deducted when someone goes quiet. The highest matching tier applies —
            penalties don’t stack. Applies to People, not to individual events.
          </span>
        </h2>
        {!editing && (
          <button className="chart-toggle-btn active" onClick={() => setEditing({ ...BLANK_TIER })}>
            + New tier
          </button>
        )}
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 10 }}>{error}</div>}

      {editing && (
        <div style={{
          border: '1px solid var(--jh-line)', borderRadius: 'var(--radius-md)',
          padding: 16, marginBottom: 16, background: 'var(--bg-soft)',
          display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end',
        }}>
          <div className="filter-group">
            <label className="filter-label">Tier name</label>
            <input type="text" className="filter-input" placeholder="e.g. Going quiet"
              value={editing.label} onChange={e => setEditing(r => ({ ...r, label: e.target.value }))}
              style={{ width: 200 }} />
          </div>
          <div className="filter-group">
            <label className="filter-label">Inactive for (months)</label>
            <input type="number" min="1" className="filter-input"
              value={editing.min_months} onChange={e => setEditing(r => ({ ...r, min_months: e.target.value }))}
              style={{ width: 110, textAlign: 'right' }} />
          </div>
          <div className="filter-group">
            <label className="filter-label">Penalty (negative)</label>
            <input type="number" max="0" className="filter-input"
              value={editing.penalty} onChange={e => setEditing(r => ({ ...r, penalty: e.target.value }))}
              style={{ width: 110, textAlign: 'right' }} />
          </div>
          <div className="filter-group">
            <label className="filter-label">Enabled</label>
            <input type="checkbox" checked={editing.enabled}
              onChange={e => setEditing(r => ({ ...r, enabled: e.target.checked }))}
              style={{ width: 18, height: 18 }} />
          </div>
          <div style={{ flex: 1 }} />
          <button className="chart-toggle-btn" onClick={() => setEditing(null)}>Cancel</button>
          <button className="chart-toggle-btn active" disabled={busy} onClick={commit}>
            {busy ? 'Saving…' : '💾 Save tier'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="spinner-wrap"><div className="spinner" /></div>
      ) : (
        <div style={{ border: '1px solid var(--jh-line)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 200px 110px 120px',
            gap: 16, padding: '10px 16px', background: 'var(--bg-soft)',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.5px',
            textTransform: 'uppercase', color: 'var(--fg-3)',
          }}>
            <div>Tier</div><div>Applies after</div>
            <div style={{ textAlign: 'right' }}>Penalty</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>

          {rules.length === 0 && (
            <div className="empty-state"><p>No decay tiers — intent never expires.</p></div>
          )}

          {rules.map(r => (
            <div key={r.id} style={{
              display: 'grid', gridTemplateColumns: '1fr 200px 110px 120px',
              gap: 16, alignItems: 'center', padding: '10px 16px',
              borderBottom: '1px solid var(--jh-line)', opacity: r.enabled ? 1 : 0.45,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {r.label}
                {!r.enabled && <span style={{ fontSize: 11, color: 'var(--fg-4)' }}> · disabled</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>
                {r.min_months} month{r.min_months === 1 ? '' : 's'} of silence
              </div>
              <div style={{
                textAlign: 'right', fontFamily: 'var(--font-display)',
                fontWeight: 800, fontSize: 16, color: '#dc2626',
              }}>
                {r.penalty}
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button className="chart-toggle-btn" onClick={() => setEditing({ ...r })}>✏️</button>
                <button className="chart-toggle-btn" disabled={busy} onClick={() => remove(r)}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 10, lineHeight: 1.5 }}>
        Decay erodes a positive score toward 0 but never past it — only the churn stage
        goes negative. A churned person who is also dormant gets both.
      </div>
    </div>
  )
}

// ============================================================
// Page
// ============================================================
export default function IntentScoringPage() {
  const {
    stages, tags, rules, loading, error,
    saveStageWeights, setTagWeight, clearTagWeight, saveRule, deleteRule,
  } = useIntentScoring()
  const { data: distribution } = useIntentDistribution({})
  const [onlyUnscored, setOnlyUnscored] = useState(false)

  function reviewUnscored() {
    setOnlyUnscored(true)
    document.getElementById('tag-weights')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div>
      <div className="page-header">
        <h1>🔥 Buying Intent</h1>
        <p>
          Score how close each lead is to buying — stage progression plus behavioural tags.
          Weights apply instantly across every lead.
        </p>
      </div>

      {error && (
        <div className="chart-section" style={{ marginBottom: 20 }}>
          <div className="empty-state">
            <p style={{ color: '#dc2626' }}>
              Couldn’t load the scoring config: {error}
              <br />
              <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>
                Migration 013 may not be applied yet.
              </span>
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="spinner-wrap"><div className="spinner" /></div>
      ) : (
        <>
          <UnscoredBanner tags={tags} onReview={reviewUnscored} />
          <BandLegend distribution={distribution} />
          <StageWeights stages={stages} saveStageWeights={saveStageWeights} />
          <TagWeights
            tags={tags}
            setTagWeight={setTagWeight}
            clearTagWeight={clearTagWeight}
            onlyUnscored={onlyUnscored}
            setOnlyUnscored={setOnlyUnscored}
          />
          <PatternRules rules={rules} saveRule={saveRule} deleteRule={deleteRule} />
          <DecaySection />
        </>
      )}
    </div>
  )
}
