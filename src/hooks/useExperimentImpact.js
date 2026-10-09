import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { experimentWindow, fillDays, sumRange, pctChange } from '../lib/experimentWindow'

/**
 * Loads awareness (LinkedIn) and downstream (GA4) daily metrics across an
 * experiment's baseline + posting windows and reduces them to:
 *
 *   days:      ['YYYY-MM-DD', …]                       baseline start → posting end
 *   awareness: { daily: [{date, impressions, engagements, posts}], before, after, posts: [...] }
 *   sites:     { [site_key]: { daily: [{date, sessions, users, new_users, key_events}], before, after, hasData } }
 */
export function useExperimentImpact(exp) {
  const win = useMemo(() => experimentWindow(exp), [exp])
  const channelKey = (exp.channels ?? []).join(',')
  const siteKey    = (exp.downstream_sites ?? []).join(',')

  const [raw, setRaw]         = useState({ daily: [], posts: [], site: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const channels = channelKey ? channelKey.split(',') : []
    const sites    = siteKey ? siteKey.split(',') : []

    async function load() {
      setLoading(true)
      const q = []
      q.push(channels.length
        ? supabase.from('awareness_daily').select('integration_id,date,impressions,engagements')
            .in('integration_id', channels).gte('date', win.baseStart).lte('date', win.postEnd)
        : Promise.resolve({ data: [] }))
      q.push(channels.length
        ? supabase.from('awareness_posts').select('integration_id,post_id,post_url,title,published_at,impressions,engagements')
            .in('integration_id', channels)
            .gte('published_at', `${win.baseStart}T00:00:00Z`).lte('published_at', `${win.postEnd}T23:59:59.999Z`)
            .order('published_at', { ascending: false })
        : Promise.resolve({ data: [] }))
      q.push(sites.length
        ? supabase.from('site_daily').select('site_key,date,sessions,total_users,new_users,key_events')
            .in('site_key', sites).gte('date', win.baseStart).lte('date', win.postEnd)
        : Promise.resolve({ data: [] }))

      const [d, p, s] = await Promise.all(q)
      if (cancelled) return
      setRaw({ daily: d.data ?? [], posts: p.data ?? [], site: s.data ?? [] })
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [channelKey, siteKey, win.baseStart, win.postEnd])

  const data = useMemo(() => {
    const days = fillDays(win.baseStart, win.postEnd)

    // ---- Awareness: sum across channels per day ----
    const aw = Object.fromEntries(days.map(d => [d, { date: d, impressions: 0, engagements: 0, posts: 0 }]))
    for (const r of raw.daily) {
      const row = aw[r.date]; if (!row) continue
      row.impressions += Number(r.impressions ?? 0)
      row.engagements += Number(r.engagements ?? 0)
    }
    for (const p of raw.posts) {
      const d = p.published_at?.slice(0, 10)
      if (aw[d]) aw[d].posts += 1
    }
    const awDaily = Object.values(aw)
    const awSum = (start, end) => ({
      impressions: sumRange(awDaily, start, end, 'impressions'),
      engagements: sumRange(awDaily, start, end, 'engagements'),
      posts:       sumRange(awDaily, start, end, 'posts'),
    })
    const awBefore = awSum(win.baseStart, win.baseEnd)
    const awAfter  = awSum(win.postStart, win.postEnd)

    // ---- Sites: per site_key per day ----
    const sites = {}
    for (const key of (exp.downstream_sites ?? [])) {
      const map = Object.fromEntries(days.map(d => [d, { date: d, sessions: 0, users: 0, new_users: 0, key_events: 0 }]))
      let hasData = false
      for (const r of raw.site) {
        if (r.site_key !== key) continue
        const row = map[r.date]; if (!row) continue
        hasData = true
        row.sessions   += Number(r.sessions ?? 0)
        row.users      += Number(r.total_users ?? 0)
        row.new_users  += Number(r.new_users ?? 0)
        row.key_events += Number(r.key_events ?? 0)
      }
      const daily = Object.values(map)
      const sum = (start, end) => ({
        sessions:   sumRange(daily, start, end, 'sessions'),
        users:      sumRange(daily, start, end, 'users'),
        new_users:  sumRange(daily, start, end, 'new_users'),
        key_events: sumRange(daily, start, end, 'key_events'),
      })
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
      sites,
    }
  }, [raw, win, exp.downstream_sites])

  return { ...data, loading }
}
