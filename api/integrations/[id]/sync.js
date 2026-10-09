// POST /api/integrations/:id/sync?days=90 — pull fresh metrics now (admin)
import { requireAdmin, sendError } from '../../_lib/admin.js'
import { syncIntegration } from '../../_lib/sync.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  try {
    await requireAdmin(req)
    const days = Math.min(365, Math.max(1, parseInt(req.query.days ?? '90', 10) || 90))
    const summary = await syncIntegration(req.query.id, { days })
    return res.status(200).json(summary)
  } catch (e) {
    return sendError(res, e)
  }
}
