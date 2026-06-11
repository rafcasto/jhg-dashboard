// Vercel serverless — GET /api/users, POST /api/users
// Service-role key stays server-side ONLY. Never exposed to browser.
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
)

// Verify the caller is an authenticated admin
async function verifyAdmin(req) {
  const auth = req.headers.authorization ?? ''
  const token = auth.replace('Bearer ', '')
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
  try {
    await verifyAdmin(req)
  } catch (e) {
    return res.status(e.message === 'Forbidden: admin only' ? 403 : 401).json({ error: e.message })
  }

  if (req.method === 'GET') {
    // List all dashboard users with their auth info
    const { data: profiles, error } = await supabaseAdmin
      .from('dashboard_users')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(profiles)
  }

  if (req.method === 'POST') {
    const { email, password, full_name, role = 'viewer' } = req.body ?? {}

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' })
    }

    // 1. Create the Supabase Auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role },
    })
    if (authError) return res.status(400).json({ error: authError.message })

    // 2. Insert into dashboard_users
    const { error: profileError } = await supabaseAdmin
      .from('dashboard_users')
      .upsert({ id: authData.user.id, email, full_name, role })

    if (profileError) return res.status(500).json({ error: profileError.message })

    return res.status(201).json({ id: authData.user.id, email, full_name, role })
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'Method not allowed' })
}
