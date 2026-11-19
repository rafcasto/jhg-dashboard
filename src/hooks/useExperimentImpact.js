import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { experimentWindow, fillDays, sumRange, pctChange } from '../lib/experimentWindow'
import { LINKEDIN_METRICS, GA4_METRICS, KIT_METRICS, EMAIL_SCOPE, emailRowScopes } from '../constants/stageSources'

const LI_FIELDS = LINKEDIN_METRICS.map(m => m.key)
const GA_FIELDS = GA4_METRICS.map(m => m.key)
const EM_FIELDS = KIT_METRICS.map(m => m.key)   // every column of the email_daily view

const NONE = Promise.resolve({ data: [] })

/**
 * Loads awareness (LinkedIn), email (Kit) and downstream (GA4) daily metrics
 * across an experiment's baseline + posting windows and reduces them to:
 *
 *   days:      ['YYYY-MM-DD', …]                       baseline start → posting end
 *   awareness: { daily: [{date, posts, impressions, engagements, likes, …}], before, after, posts: [...] }
 *   email:     { daily: [{date, broadcasts, recipients, opens, clicks, unsubscribes, entered}], before, after,
 *                scopes: { broadcasts | sequences | 'seq:<id>' | 'bc:<id>' → {name, kind, daily, before, after} },
 *                broadcasts: [...sent in the window], sequences: [{…lifetime, emails: [...]}] }
 *   sites:     { [site_key]: { daily: [{date, sessions, total_users, new_users, page_views, …}], before, after, hasData } }
 *
 * `exp.channels` holds integration ids of ANY kind (LinkedIn accounts and Kit
 * accounts share the list); each table simply ignores ids it has no rows for.
 *
 * `before` / `after` carry every LinkedIn / Kit / GA4 metric (see constants/stageSources),
 * so custom-dashboard stages can read any of them straight off this hook.
 */
export function useExperimentImpact(exp) {
  const win = useMemo(() => experimentWindow(exp), [exp])
  const channelKey = (exp.channels ?? []).join(',')
  const siteKey    = (exp.downstream_sites ?? []).join(',')

  const [raw, setRaw]         = useState({ daily: [], posts: [], site: [], emailDaily: [], broadcasts: [], sequences: [], seqEmails: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const channels = channelKey ? channelKey.split(',') : []
    const sites    = siteKey ? siteKey.split(',') : []
    const fromTs   = `${win.baseStart}T00:00:00Z`, toTs = `${win.postEnd}T23:59:59.999Z`

    async function load() {
      setLoading(true)
      const q = [
        channels.length
          ? supabase.from('awareness_daily').select(`integration_id,date,${LI_FIELDS.join(',')}`)
              .in('integration_id', channels).gte('date', win.baseStart).lte('date', win.postEnd)
          : NONE,
        channels.length
          ? supabase.from('awareness_posts').select('integration_id,post_id,post_url,title,published_at,impressions,engagements')
              .in('integration_id', channels).gte('published_at', fromTs).lte('published_at', toTs)
              .order('published_at', { ascending: false })
          : NONE,
        sites.length
          ? supabase.from('site_daily').select(`site_key,date,${GA_FIELDS.join(',')}`)
              .in('site_key', sites).gte('date', win.baseStart).lte('date', win.postEnd)
          : NONE,
        channels.length
          ? supabase.from('email_daily').select(`integration_id,channel,broadcast_id,sequence_id,date,${EM_FIELDS.join(',')}`)
              .in('integration_id', channels).gte('date', win.baseStart).lte('date', win.postEnd)
          : NONE,
        channels.length
          ? supabase.from('email_broadcasts').select('integration_id,broadcast_id,subject,send_at,status,recipients,opens,clicks,unsubscribes')
              .in('integration_id', channels).gte('send_at', fromTs).lte('send_at', toTs)
              .order('send_at', { ascending: false })
          : NONE,
        channels.length
          ? supabase.from('email_sequences').select('integration_id,sequence_id,name,active,email_count,subscriber_count,recipients,opens,clicks,unsubscribes')
              .in('integration_id', channels).order('name')
          : NONE,
        channels.length
          ? supabase.from('email_sequence_emails').select('integration_id,sequence_id,email_id,subject,position,published,recipients,opens,clicks,unsubscribes')
              .in('integration_id', channels).order('position')
          : NONE,
      ]
      const [d, p, s, ed, eb, es, ee] = await Promise.all(q)
      if (cancelled) return
      setRaw({ daily: d.data ?? [], posts: p.data ?? [], site: s.data ?? [],
               emailDaily: ed.data ?? [], broadcasts: eb.data ?? [], sequences: es.data ?? [], seqEmails: ee.data ?? [] })
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [channelKey, siteKey, win.baseStart, win.postEnd])

  const data = useMemo(() => {
    const days = fillDays(win.baseStart, win.postEnd)

    // ---- Awareness: sum across channels per day ----
    const blankLi = () => Object.fromEntries(LI_FIELDS.map(f => [f, 0]))
    const aw = Object.fromEntries(days.map(d => [d, { date: d, posts: 0, ...blankLi() }]))
    for (const r of raw.daily) {
      const row = aw[r.date]; if (!row) continue
      for (const f of LI_FIELDS) row[f] += Number(r[f] ?? 0)
    }
    for (const p of raw.posts) {
      const d = p.published_at?.slice(0, 10)
      if (aw[d]) aw[d].posts += 1
    }
    const awDaily = Object.values(aw)
    const awSum = (start, end) => Object.fromEntries(
      ['posts', ...LI_FIELDS].map(f => [f, sumRange(awDaily, start, end, f)]))
    const awBefore = awSum(win.baseStart, win.baseEnd)
    const awAfter  = awSum(win.postStart, win.postEnd)

    // ---- Email: email_daily rows (broadcasts by send day + sequence deltas) ----
    const emDailyOf = rows => {
      const m = Object.fromEntries(days.map(d => [d, { date: d, ...Object.fromEntries(EM_FIELDS.map(f => [f, 0])) }]))
      for (const r of rows) {
        const row = m[r.date]; if (!row) continue
        for (const f of EM_FIELDS) row[f] += Number(r[f] ?? 0)
      }
      return Object.values(m)
    }
    const emSum = (daily, start, end) => Object.fromEntries(EM_FIELDS.map(f => [f, sumRange(daily, start, end, f)]))
    const emDaily  = emDailyOf(raw.emailDaily)
    const emBefore = emSum(emDaily, win.baseStart, win.baseEnd)
    const emAfter  = emSum(emDaily, win.postStart, win.postEnd)

    const seqName = Object.fromEntries(raw.sequences.map(s => [s.sequence_id, s.name]))
    const bcName  = Object.fromEntries(raw.broadcasts.map(b => [b.broadcast_id, b.subject ?? b.broadcast_id]))
    const scopeMeta = k =>
      k === EMAIL_SCOPE.BROADCASTS ? { name: 'All broadcasts', kind: 'broadcasts' }
      : k === EMAIL_SCOPE.SEQUENCES ? { name: 'All sequences',  kind: 'sequences' }
      : k.startsWith('seq:')        ? { name: seqName[k.slice(4)] ?? 'Sequence', kind: 'sequence' }
      :                               { name: bcName[k.slice(3)]  ?? 'Broadcast', kind: 'broadcast' }
    const byScope = {}
    for (const r of raw.emailDaily) for (const k of emailRowScopes(r)) (byScope[k] ??= []).push(r)
    const scopes = Object.fromEntries(Object.entries(byScope).map(([k, rows]) => {
      const daily = emDailyOf(rows)
      return [k, {
        ...scopeMeta(k),
        hasData: true, daily,
        before: emSum(daily, win.baseStart, win.baseEnd),
        after:  emSum(daily, win.postStart, win.postEnd),
      }]
    }))
    const sequences = raw.sequences.map(s => ({
      ...s,
      emails: raw.seqEmails.filter(e => e.integration_id === s.integration_id && e.sequence_id === s.sequence_id),
    }))

    // ---- Sites: per site_key per day ----
    const sites = {}
    for (const key of (exp.downstream_sites ?? [])) {
      const map = Object.fromEntries(days.map(d => [d, { date: d, ...Object.fromEntries(GA_FIELDS.map(f => [f, 0])) }]))
      let hasData = false
      for (const r of raw.site) {
        if (r.site_key !== key) continue
        const row = map[r.date]; if (!row) continue
        hasData = true
        for (const f of GA_FIELDS) row[f] += Number(r[f] ?? 0)
      }
      const daily = Object.values(map)
      const sum = (start, end) => Object.fromEntries(GA_FIELDS.map(f => [f, sumRange(daily, start, end, f)]))
      sites[key] = { daily, hasData, before: sum(win.baseStart, win.baseEnd), after: sum(win.postStart, win.postEnd) }
    }

    return {
      days, window: win,
      awareness: {
        daily: awDaily, before: awBefore, after: awAfter,
        hasData: raw.daily.length > 0 || raw.posts.length > 0,
        posts: raw.posts.filter(p => p.published_at >= `${win.postStart}T00:00:00Z`),
        delta: { impressions: pctChange(awBefore.impressions, awAfter.impressions),
                 engagements: pctChange(awBefore.engagements, awAfter.engagements) },
      },
      email: {
        daily: emDaily, before: emBefore, after: emAfter,
        hasData: raw.emailDaily.length > 0,
        scopes, sequences,
        broadcasts: raw.broadcasts.filter(b => b.send_at >= `${win.postStart}T00:00:00Z`),
        delta: { recipients: pctChange(emBefore.recipients, emAfter.recipients),
                 clicks:     pctChange(emBefore.clicks, emAfter.clicks) },
      },
      sites,
    }
  }, [raw, win, exp.downstream_sites])

  return { ...data, loading }
}
