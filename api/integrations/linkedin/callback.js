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
  let st = null
  try { st = li.readState(state) } catch (e) { return back({ linkedin: 'error', msg: e.message }) }

  // Invitees aren't dashboard users — show them a plain confirmation page.
  const done = (ok, msg) => st?.invite
    ? res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').end(invitePage(ok, msg))
    : back(ok ? { linkedin: 'connected', id: msg } : { linkedin: 'error', msg })

  if (error) return done(false, error_description || error)

  try {
    const secrets = await li.exchangeCode(code, redirectUri())
    const me = await li.userInfo(secrets.access_token).catch(() => ({}))

    let orgs = []
    try { orgs = await li.listOrganizations(secrets.access_token) }
    catch (e) { console.warn('LinkedIn organizationAcls failed:', e.message) }

    const name = me.name || [me.given_name, me.family_name].filter(Boolean).join(' ') || 'LinkedIn account'
    const memberUrn = me.sub ? `urn:li:person:${me.sub}` : null
    // Default to the member's own profile (r_member_postAnalytics); org pages
    // they admin are offered in the Settings dropdown.
    const author = memberUrn ? { urn: memberUrn, name } : (orgs.length === 1 ? orgs[0] : null)

    const { data: integ, error: iErr } = await supabaseAdmin.from('integrations').insert({
      kind: 'linkedin',
      label: st.label || name,
      config: {
        member_sub:  me.sub ?? null,
        member_name: name,
        member_urn:  memberUrn,
        picture:     me.picture ?? null,
        orgs,
        author_urn:  author?.urn ?? null,
        author_name: author?.name ?? null,
      },
      status: author ? 'connected' : 'pending',
      created_by: st.uid,
    }).select().single()
    if (iErr) throw new Error(iErr.message)

    const { error: sErr } = await supabaseAdmin.from('integration_secrets')
      .insert({ integration_id: integ.id, secrets })
    if (sErr) throw new Error(sErr.message)

    return done(true, integ.id)
  } catch (e) {
    console.error('LinkedIn callback failed:', e)
    return done(false, e.message)
  }
}

function invitePage(ok, msg) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  return `<!doctype html><meta charset="utf-8"><title>LinkedIn connected</title>
<body style="font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;padding:0 20px;line-height:1.5">
<h1 style="font-size:22px">${ok ? '✅ Connected' : '⚠️ Something went wrong'}</h1>
<p>${ok
  ? 'Thanks — your LinkedIn post analytics are now linked to the dashboard. You can close this tab.'
  : esc(msg) + '<br><br>Ask whoever sent you the link for a new one.'}</p>
</body>`
}
