// GET  /api/integrations        — list (any dashboard user; secrets never returned)
// POST /api/integrations        — create a GA4 site integration (admin)
import { supabaseAdmin, requireUser, requireAdmin, sendError, HttpError } from '../_lib/admin.js'

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      await requireUser(req)
      const { data, error } = await supabaseAdmin
        .from('integrations').select('*').order('created_at', { ascending: true })
      if (error) throw new Error(error.message)
      return res.status(200).json(data)
    }

    if (req.method === 'POST') {
      const { user } = await requireAdmin(req)
      const { kind = 'ga4', label, site_key, config = {}, secrets = {} } = req.body ?? {}
      if (kind !== 'ga4') throw new HttpError(400, 'LinkedIn accounts are connected via OAuth — use "Connect LinkedIn"')
      if (!label?.trim())  throw new HttpError(400, 'label is required')
      if (!site_key?.trim()) throw new HttpError(400, 'site_key is required')
      if (!config.property_id) throw new HttpError(400, 'GA4 property id is required')

      const sa = parseServiceAccount(secrets.service_account)

      const { data: integ, error } = await supabaseAdmin.from('integrations').insert({
        kind, label: label.trim(), site_key: site_key.trim().toLowerCase(),
        config: {
          property_id:           String(config.property_id).trim().replace(/^properties\//, ''),
          measurement_id:        config.measurement_id?.trim() || null,
          site_url:              config.site_url?.trim() || null,
          service_account_email: sa?.client_email ?? null,
        },
        status: sa ? 'connected' : 'pending',
        created_by: user.id,
      }).select().single()
      if (error) throw new Error(error.message)

      if (sa) {
        const { error: sErr } = await supabaseAdmin.from('integration_secrets')
          .insert({ integration_id: integ.id, secrets: { service_account: sa } })
        if (sErr) throw new Error(sErr.message)
      }
      return res.status(201).json(integ)
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    return sendError(res, e)
  }
}

export function parseServiceAccount(raw) {
  if (!raw) return null
  const sa = typeof raw === 'string' ? safeJson(raw) : raw
  if (!sa?.client_email || !sa?.private_key) {
    throw new HttpError(400, 'Service account JSON must include client_email and private_key')
  }
  return sa
}

function safeJson(s) {
  try { return JSON.parse(s) } catch { throw new HttpError(400, 'Service account must be valid JSON') }
}
