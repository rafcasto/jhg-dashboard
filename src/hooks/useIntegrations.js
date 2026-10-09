import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../supabase'
import { apiFetch } from '../lib/api'

/**
 * Connected external systems (integrations table — never contains secrets).
 * Reads go straight to Supabase (RLS: any dashboard user);
 * writes go through the Vercel API (admin only, service-role key).
 */
export function useIntegrations() {
  const [integrations, setIntegrations] = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)

  const refresh = useCallback(async () => {
    setError(null)
    const { data, error: err } = await supabase
      .from('integrations').select('*').order('created_at', { ascending: true })
    if (err) setError(err.message)
    else setIntegrations(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const linkedin = useMemo(() => integrations.filter(i => i.kind === 'linkedin'), [integrations])
  const ga4      = useMemo(() => integrations.filter(i => i.kind === 'ga4'),      [integrations])

  const createGa4 = useCallback(async (payload) => {
    const data = await apiFetch('/api/integrations', { method: 'POST', body: { kind: 'ga4', ...payload } })
    await refresh()
    return data
  }, [refresh])

  const update = useCallback(async (id, payload) => {
    const data = await apiFetch(`/api/integrations/${id}`, { method: 'PATCH', body: payload })
    await refresh()
    return data
  }, [refresh])

  const remove = useCallback(async (id) => {
    await apiFetch(`/api/integrations/${id}`, { method: 'DELETE' })
    await refresh()
  }, [refresh])

  const sync = useCallback(async (id, days = 90) => {
    try {
      return await apiFetch(`/api/integrations/${id}/sync?days=${days}`, { method: 'POST' })
    } finally {
      await refresh()
    }
  }, [refresh])

  const importCsv = useCallback(async (id, body) => {
    const data = await apiFetch(`/api/integrations/${id}/import`, { method: 'POST', body })
    await refresh()
    return data
  }, [refresh])

  const linkedinAuthUrl = useCallback(async (label) => {
    const q = label ? `?label=${encodeURIComponent(label)}` : ''
    const { url } = await apiFetch(`/api/integrations/linkedin/start${q}`)
    return url
  }, [])

  return { integrations, linkedin, ga4, loading, error, refresh,
           createGa4, update, remove, sync, importCsv, linkedinAuthUrl }
}
