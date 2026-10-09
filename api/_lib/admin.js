// Shared server-side helpers for Vercel functions.
// Service-role key stays here — NEVER shipped to the browser.
import { createClient } from '@supabase/supabase-js'

export const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
)

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

/** Resolve the calling dashboard user from the Bearer token. */
export async function requireUser(req) {
  const token = (req.headers.authorization ?? '').replace('Bearer ', '')
  if (!token) throw new HttpError(401, 'Unauthorized')

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) throw new HttpError(401, 'Unauthorized')

  const { data: profile } = await supabaseAdmin
    .from('dashboard_users').select('role').eq('id', user.id).single()

  return { user, role: profile?.role ?? 'viewer' }
}

export async function requireAdmin(req) {
  const ctx = await requireUser(req)
  if (ctx.role !== 'admin') throw new HttpError(403, 'Forbidden: admin only')
  return ctx
}

export function sendError(res, e) {
  const status = e instanceof HttpError ? e.status : 500
  if (status === 500) console.error(e)
  return res.status(status).json({ error: e?.message ?? 'Internal error' })
}

/** Public base URL of this deployment (used for OAuth redirects). */
export function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '')
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:5173'
}

export const isoDay = d => new Date(d).toISOString().slice(0, 10)
