// Vercel serverless — DELETE /api/users/:id
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
)

async function verifyAdmin(req) {
  const token = (req.headers.authorization ?? '').replace('Bearer ', '')
  if (!token) throw new Error('Unauthorized')

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) throw new Error('Unauthorized')

  const { data: profile } = await supabaseAdmin
    .from('dashboard_users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') throw new Error('Forbidden: admin only')
  return user
}

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let callerUser
  try {
    callerUser = await verifyAdmin(req)
  } catch (e) {
    return res.status(e.message === 'Forbidden: admin only' ? 403 : 401).json({ error: e.message })
  }

  const { id } = req.query

  // Safety: can't delete yourself
  if (id === callerUser.id) {
    return res.status(400).json({ error: "You cannot remove your own account." })
  }

  // 1. Remove from dashboard_users (cascade deletes on auth.users FK)
  const { error: profileError } = await supabaseAdmin
    .from('dashboard_users')
    .delete()
    .eq('id', id)
  if (profileError) return res.status(500).json({ error: profileError.message })

  // 2. Delete the Supabase Auth user
  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id)
  if (authError) return res.status(500).json({ error: authError.message })

  return res.status(200).json({ deleted: id })
}
