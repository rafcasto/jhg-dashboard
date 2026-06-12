/**
 * meetup-webhook — Supabase Edge Function
 *
 * Receives Meetup Pro webhook events and upserts leads into jobhackers_leads.
 *
 * Handled event types:
 *   rsvp              — member RSVPs "yes" to an event
 *   group_member_join — new member joins the Meetup group
 *
 * Deploy URL (once live):
 *   https://rizumeeeqojhxhaskbmx.supabase.co/functions/v1/meetup-webhook
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Built-in edge function env vars — no manual config needed
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// Optional: set a secret in Meetup Pro → verify it here to block spoofed calls
const WEBHOOK_SECRET = Deno.env.get('MEETUP_WEBHOOK_SECRET') ?? ''

Deno.serve(async (req: Request) => {
  // Health check
  if (req.method === 'GET') {
    return json({ status: 'ok', function: 'meetup-webhook' })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  // Verify secret header if one is configured
  if (WEBHOOK_SECRET) {
    const incoming = req.headers.get('x-meetup-signature') ?? req.headers.get('x-webhook-secret') ?? ''
    if (incoming !== WEBHOOK_SECRET) {
      console.warn('meetup-webhook: invalid signature')
      return json({ error: 'Unauthorized' }, 401)
    }
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  console.log('meetup-webhook received:', JSON.stringify(body))

  const eventType = (body.type as string) ?? (body.event_type as string) ?? ''

  let lead: Record<string, unknown> | null = null

  // ── RSVP event ──────────────────────────────────────────────
  if (eventType === 'rsvp') {
    const response = (body.response as string) ?? ''
    if (response !== 'yes') {
      // Ignore cancelled RSVPs
      return json({ skipped: true, reason: `rsvp response is "${response}"` })
    }

    const member    = (body.member as Record<string, unknown>) ?? {}
    const event     = (body.event  as Record<string, unknown>) ?? {}
    const eventName = ((event.name as string) ?? 'MEETUP').toUpperCase()

    lead = {
      first_name: splitFirst(member.name as string),
      last_name:  splitLast(member.name as string),
      email:      member.email as string,
      stage:      'awareness',
      source:     'meetup',
      tag:        `EVENT -> RSVP -> ${eventName}`,
      score:      0,
    }
  }

  // ── New group member ─────────────────────────────────────────
  else if (eventType === 'group_member_join' || eventType === 'member_join') {
    const member = (body.member as Record<string, unknown>) ?? {}

    lead = {
      first_name: splitFirst(member.name as string),
      last_name:  splitLast(member.name as string),
      email:      member.email as string,
      stage:      'awareness',
      source:     'meetup',
      tag:        'COMMUNITY -> MEMBER -> JOIN',
      location:   (member.city as string) ?? null,
      score:      0,
    }
  }

  // ── Unknown event — log and return 200 so Meetup doesn't retry ──
  else {
    console.log(`meetup-webhook: unhandled event type "${eventType}"`)
    return json({ skipped: true, reason: `unhandled event type: ${eventType}` })
  }

  // Require email
  if (!lead.email) {
    console.error('meetup-webhook: no email in payload', body)
    return json({ error: 'No email in payload' }, 422)
  }

  // Upsert — if email already exists, update name/tag/location but
  // do NOT overwrite stage (they may have progressed through the funnel)
  const { error } = await supabase
    .from('jobhackers_leads')
    .upsert(lead, {
      onConflict:       'email',
      ignoreDuplicates: true,   // keep existing stage if they're already in the funnel
    })

  if (error) {
    console.error('meetup-webhook: supabase upsert error', error)
    return json({ error: error.message }, 500)
  }

  console.log(`meetup-webhook: upserted lead ${lead.email}`)
  return json({ success: true, email: lead.email, event: eventType })
})

// ── Helpers ──────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function splitFirst(name?: string): string {
  if (!name) return ''
  return name.trim().split(/\s+/)[0] ?? ''
}

function splitLast(name?: string): string | null {
  if (!name) return null
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? parts.slice(1).join(' ') : null
}
