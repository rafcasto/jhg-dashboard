import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const EMPTY = { sequences: [], broadcasts: [] }

/**
 * Every Kit sequence and broadcast the dashboard knows about (refreshed by
 * the Kit sync). Used to pick / label the email a stage is scoped to.
 *
 *   sequences:  [{ integration_id, sequence_id, name, active, email_count, subscriber_count, … }]
 *   broadcasts: [{ integration_id, broadcast_id, subject, send_at, recipients }]  newest first
 */
export function useEmailCatalog() {
  const [catalog, setCatalog] = useState(EMPTY)
  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('email_sequences')
        .select('integration_id,sequence_id,name,active,email_count,subscriber_count,recipients,opens,clicks,unsubscribes')
        .order('name'),
      supabase.from('email_broadcasts')
        .select('integration_id,broadcast_id,subject,send_at,recipients')
        .not('send_at', 'is', null)
        .order('send_at', { ascending: false })
        .limit(300),
    ]).then(([s, b]) => {
      if (!cancelled) setCatalog({ sequences: s.data ?? [], broadcasts: b.data ?? [] })
    })
    return () => { cancelled = true }
  }, [])
  return catalog
}
