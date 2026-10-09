// GET /api/integrations/env-status — which server-side settings are configured (admin)
import { requireAdmin, sendError, appUrl } from '../_lib/admin.js'
import { redirectUri } from './linkedin/start.js'

export default async function handler(req, res) {
  try {
    await requireAdmin(req)
    return res.status(200).json({
      app_url: appUrl(),
      linkedin: {
        client_id:     !!process.env.LINKEDIN_CLIENT_ID,
        client_secret: !!process.env.LINKEDIN_CLIENT_SECRET,
        redirect_uri:  redirectUri(),
        api_version:   process.env.LINKEDIN_API_VERSION || '202508',
      },
      cron: { secret: !!process.env.CRON_SECRET, schedule: '03:00 UTC daily' },
    })
  } catch (e) {
    return sendError(res, e)
  }
}
