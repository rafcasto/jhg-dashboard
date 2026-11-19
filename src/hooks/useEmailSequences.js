import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

/**
 * Every Kit sequence the dashboard knows about (email_sequences table —
 * lifetime stats, refreshed by the Kit sync). Used to label / pick the
 * sequence a stage or experiment is scoped to.
 */
export function useEmailSequences() {
  const [sequences, setSequences] = useState([])
  useEffect(() => {
    let cancelled = false
    supabase.from('email_sequences')
      .select('integration_id,sequence_id,name,active,email_count,subscriber_count,recipients,opens,clicks,unsubscribes')
      .order('name')
      .then(({ data }) => { if (!cancelled) setSequences(data ?? []) })
    return () => { cancelled = true }
  }, [])
  return sequences
}
