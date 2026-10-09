// PATCH  /api/integrations/:id  — update label / site / config / secrets (admin)
// DELETE /api/integrations/:id  — disconnect (admin; cascades metrics + secrets)
import { supabaseAdmin, requireAdmin, sendError, HttpError } from '../_lib/admin.js'
import { parseServiceAccount } from './index.js'

export default async function handler(req, res) {
  try {
    await requireAdmin(req)
    const { id } = req.query

    const { data: integ } = await supabaseAdmin.from('integrations').select('*').eq('id', id).single()
    if (!integ) throw new HttpError(404, 'Integration not found')

    if (req.method === 'DELETE') {
      const { error } = await supabaseAdmin.from('integrations').delete().eq('id', id)
      if (error) throw new Error(error.message)
      return res.status(200).json({ deleted: id })
    }

    if (req.method === 'PATCH') {
      const { label, site_key, config = {}, secrets = {} } = req.body ?? {}
      const patch = { updated_at: new Date().toISOString() }
      if (label?.trim())    patch.label    = label.trim()
      if (site_key?.trim()) patch.site_key = site_key.trim().toLowerCase()

      const nextConfig = { ...integ.config }
      if (integ.kind === 'ga4') {
        if (config.property_id)            nextConfig.property_id    = String(config.property_id).trim().replace(/^properties\//, '')
        if ('measurement_id' in config)    nextConfig.measurement_id = config.measurement_id?.trim() || null
        if ('site_url' in config)          nextConfig.site_url       = config.site_url?.trim() || null
        const sa = parseServiceAccount(secrets.service_account)
        if (sa) {
          nextConfig.service_account_email = sa.client_email
          const { error } = await supabaseAdmin.from('integration_secrets')
            .upsert({ integration_id: id, secrets: { service_account: sa }, updated_at: new Date().toISOString() })
          if (error) throw new Error(error.message)
          patch.status = 'connected'; patch.last_error = null
        }
      }
      if (integ.kind === 'linkedin' && 'author_urn' in config) {
        const org = (integ.config?.orgs ?? []).find(o => o.urn === config.author_urn)
        nextConfig.author_urn  = config.author_urn || null
        nextConfig.author_name = org?.name ?? (config.author_urn ? integ.config?.member_name : null)
        patch.status = 'connected'; patch.last_error = null
      }
      patch.config = nextConfig

      const { data, error } = await supabaseAdmin.from('integrations')
        .update(patch).eq('id', id).select().single()
      if (error) throw new Error(error.message)
      return res.status(200).json(data)
    }

    res.setHeader('Allow', 'PATCH, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    return sendError(res, e)
  }
}
