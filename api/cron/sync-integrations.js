// Vercel Cron → GET /api/cron/sync-integrations (daily, see vercel.json)
// Vercel sends "Authorization: Bearer <CRON_SECRET>" automatically.
import { syncAll } from '../_lib/sync.js'

export default async function handler(req, res) {
  const expected = process.env.CRON_SECRET
  if (!expected || req.headers.authorization !== `Bearer ${expected}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const results = await syncAll({ days: 14 })
  return res.status(200).json({ synced: results.filter(r => r.ok).length, results })
}
