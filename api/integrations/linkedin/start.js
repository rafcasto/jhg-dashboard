// GET /api/integrations/linkedin/start — returns the LinkedIn OAuth URL (admin)
//   ?label=…    name for the new account
//   ?invite=1   7-day link to hand to someone else; they authorise with their
//               own LinkedIn login and the account appears in Settings
import { requireAdmin, sendError, appUrl, HttpError } from '../../_lib/admin.js'
import * as li from '../../_lib/linkedin.js'

export const redirectUri = () =>
  process.env.LINKEDIN_REDIRECT_URI || `${appUrl()}/api/integrations/linkedin/callback`

export default async function handler(req, res) {
  try {
    const { user } = await requireAdmin(req)
    if (!li.isConfigured()) {
      throw new HttpError(400, 'Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in the Vercel environment first')
    }
    const invite = req.query.invite === '1'
    const state  = li.makeState(
      { uid: user.id, label: req.query.label ?? null, invite },
      { ttlMs: invite ? 7 * 24 * 60 * 60 * 1000 : 10 * 60 * 1000 })
    return res.status(200).json({
      url: li.authorizationUrl(redirectUri(), state), redirect_uri: redirectUri(),
      expires_in_days: invite ? 7 : null,
    })
  } catch (e) {
    return sendError(res, e)
  }
}
