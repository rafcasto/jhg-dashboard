import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'

/**
 * Buying-intent scoring config.
 *
 * lead_intent_config() returns, in one round-trip:
 *   stages — all 7 enum stages with their weight + live lead count
 *   tags   — every distinct normalised tag with its count + resolved weight
 *   rules  — the tag rule set (exact overrides like; like rules sum)
 *
 * Scores are computed on read in Postgres, so any save here immediately
 * re-scores the entire lead base — no recompute job, no stale column.
 */
export function useIntentScoring() {
  const [stages, setStages] = useState([])
  const [tags, setTags]     = useState([])
  const [rules, setRules]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.rpc('lead_intent_config')
    if (err) { setError(err.message); setLoading(false); return }
    setStages(data?.stages ?? [])
    setTags(data?.tags ?? [])
    setRules(data?.rules ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  /** Save a batch of stage weights: [{ stage_key, weight }] */
  const saveStageWeights = useCallback(async (entries) => {
    const { error: err } = await supabase
      .from('lead_intent_stage_weights')
      .upsert(
        entries.map(e => ({
          stage_key:  e.stage_key,
          weight:     e.weight,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'stage_key' }
      )
    if (err) throw new Error(err.message)
    await refresh()
  }, [refresh])

  /**
   * Set an explicit weight for one normalised tag.
   * Creates/updates an 'exact' rule, which overrides any broad pattern rule.
   */
  const setTagWeight = useCallback(async (normalizedTag, weight, label) => {
    const { error: err } = await supabase
      .from('lead_intent_tag_rules')
      .upsert({
        label:      label || normalizedTag,
        pattern:    normalizedTag,
        match_type: 'exact',
        weight,
        enabled:    true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'match_type,pattern' })
    if (err) throw new Error(err.message)
    await refresh()
  }, [refresh])

  /** Drop the exact override for a tag, falling back to pattern rules. */
  const clearTagWeight = useCallback(async (normalizedTag) => {
    const { error: err } = await supabase
      .from('lead_intent_tag_rules')
      .delete()
      .eq('match_type', 'exact')
      .eq('pattern', normalizedTag)
    if (err) throw new Error(err.message)
    await refresh()
  }, [refresh])

  const saveRule = useCallback(async (rule) => {
    const payload = {
      label:      rule.label,
      pattern:    rule.pattern,
      match_type: rule.match_type,
      weight:     rule.weight,
      enabled:    rule.enabled,
      updated_at: new Date().toISOString(),
    }
    const { error: err } = rule.id
      ? await supabase.from('lead_intent_tag_rules').update(payload).eq('id', rule.id)
      : await supabase.from('lead_intent_tag_rules').insert(payload)
    if (err) throw new Error(err.message)
    await refresh()
  }, [refresh])

  const deleteRule = useCallback(async (id) => {
    const { error: err } = await supabase.from('lead_intent_tag_rules').delete().eq('id', id)
    if (err) throw new Error(err.message)
    await refresh()
  }, [refresh])

  return {
    stages, tags, rules, loading, error, refresh,
    saveStageWeights, setTagWeight, clearTagWeight, saveRule, deleteRule,
  }
}

/**
 * Band distribution across the lead base.
 * Returns [{ band, sort, lead_count }] from lead_intent_distribution().
 */
export function useIntentDistribution({ startDate, endDate } = {}) {
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    let cancelled = false
    async function fetch() {
      setLoading(true)
      const { data: rows, error: err } = await supabase.rpc('lead_intent_distribution', {
        p_start: startDate || null,
        p_end:   endDate   || null,
      })
      if (cancelled) return
      if (err) { setError(err.message); setLoading(false); return }
      setData(rows ?? [])
      setLoading(false)
    }
    fetch()
    return () => { cancelled = true }
  }, [startDate, endDate])

  return { data, loading, error }
}

/**
 * Inactivity decay tiers.
 *
 * Buying intent is perishable — someone who opened coaching last week
 * isn't the prospect someone who did it a year ago is. The highest
 * matching tier applies (penalties are not cumulative), and decay
 * erodes a positive score toward 0 without ever flipping its sign.
 */
export function useDecayRules() {
  const [rules, setRules]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('lead_intent_decay_rules')
      .select('*')
      .order('min_months')
    if (err) { setError(err.message); setLoading(false); return }
    setRules(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const saveRule = useCallback(async (rule) => {
    const payload = {
      label:      rule.label,
      min_months: Number(rule.min_months),
      penalty:    Number(rule.penalty),
      enabled:    rule.enabled,
      updated_at: new Date().toISOString(),
    }
    const { error: err } = rule.id
      ? await supabase.from('lead_intent_decay_rules').update(payload).eq('id', rule.id)
      : await supabase.from('lead_intent_decay_rules').insert(payload)
    if (err) throw new Error(err.message)
    await refresh()
  }, [refresh])

  const deleteRule = useCallback(async (id) => {
    const { error: err } = await supabase.from('lead_intent_decay_rules').delete().eq('id', id)
    if (err) throw new Error(err.message)
    await refresh()
  }, [refresh])

  return { rules, loading, error, refresh, saveRule, deleteRule }
}
