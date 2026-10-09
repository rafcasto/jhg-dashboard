// GET /api/integrations/linkedin/start — returns the LinkedIn OAuth URL (admin)
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
    const state = li.makeState({ uid: user.id, label: req.query.label ?? null })
    return res.status(200).json({ url: li.authorizationUrl(redirectUri(), state), redirect_uri: redirectUri() })
  } catch (e) {
    return sendError(res, e)
  }
}
