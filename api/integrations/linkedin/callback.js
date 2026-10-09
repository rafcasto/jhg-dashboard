// GET /api/integrations/linkedin/callback — OAuth redirect target.
// Exchanges the code, discovers the member + their pages, stores tokens
// server-side, then bounces back to /settings.
import { supabaseAdmin, appUrl } from '../../_lib/admin.js'
import * as li from '../../_lib/linkedin.js'
import { redirectUri } from './start.js'

export default async function handler(req, res) {
  const back = (params) => {
    const u = new URL('/settings', appUrl())
    for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v)
    return res.redirect(302, u.toString())
  }

  const { code, state, error, error_description } = req.query
  if (error) return back({ linkedin: 'error', msg: error_description || error })

  try {
    const st = li.readState(state)
    const secrets = await li.exchangeCode(code, redirectUri())
    const me = await li.userInfo(secrets.access_token).catch(() => ({}))

    let orgs = []
    try { orgs = await li.listOrganizations(secrets.access_token) }
    catch (e) { console.warn('LinkedIn organizationAcls failed:', e.message) }

    const name = me.name || [me.given_name, me.family_name].filter(Boolean).join(' ') || 'LinkedIn account'
    const single = orgs.length === 1 ? orgs[0] : null

    const { data: integ, error: iErr } = await supabaseAdmin.from('integrations').insert({
      kind: 'linkedin',
      label: st.label || name,
      config: {
        member_sub:  me.sub ?? null,
        member_name: name,
        member_urn:  me.sub ? `urn:li:person:${me.sub}` : null,
        picture:     me.picture ?? null,
        orgs,
        author_urn:  single?.urn ?? null,
        author_name: single?.name ?? null,
      },
      status: single ? 'connected' : 'pending',
      created_by: st.uid,
    }).select().single()
    if (iErr) throw new Error(iErr.message)

    const { error: sErr } = await supabaseAdmin.from('integration_secrets')
      .insert({ integration_id: integ.id, secrets })
    if (sErr) throw new Error(sErr.message)

    return back({ linkedin: 'connected', id: integ.id })
  } catch (e) {
    console.error('LinkedIn callback failed:', e)
    return back({ linkedin: 'error', msg: e.message })
  }
}
