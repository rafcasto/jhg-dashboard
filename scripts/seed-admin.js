#!/usr/bin/env node
/**
 * npm run seed:admin
 *
 * Creates the admin user in Supabase Auth and registers them in
 * the dashboard_users table with role = 'admin'.
 *
 * Required env vars (in .env):
 *   VITE_SUPABASE_URL
 *   SUPABASE_SECRET_KEY
 *   ADMIN_EMAIL
 *   ADMIN_PASSWORD
 *   ADMIN_NAME
 */

import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const required = ['VITE_SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_NAME']
for (const key of required) {
  if (!process.env[key] || process.env[key].includes('xxxxxxxxx')) {
    console.error(`❌  Missing or placeholder env var: ${key}`)
    process.exit(1)
  }
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { realtime: { transport: ws } }
)

const email     = process.env.ADMIN_EMAIL
const password  = process.env.ADMIN_PASSWORD
const full_name = process.env.ADMIN_NAME

console.log(`\n🌱  Seeding admin user: ${email}`)
console.log(`    Name: ${full_name}\n`)

// 1. Create / update the Supabase Auth user
const { data: authData, error: authError } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name, role: 'admin' },
})

if (authError) {
  if (authError.message?.includes('already been registered') || authError.message?.includes('already exists')) {
    console.log('⚠️   Auth user already exists — updating metadata…')
    const { data: { users } } = await supabase.auth.admin.listUsers()
    const existing = users.find(u => u.email === email)
    if (existing) {
      await supabase.auth.admin.updateUserById(existing.id, {
        password,
        user_metadata: { full_name, role: 'admin' },
      })
      console.log(`✅  Auth user updated (id: ${existing.id})`)

      const { error: upsertErr } = await supabase
        .from('dashboard_users')
        .upsert({ id: existing.id, email, full_name, role: 'admin' })
      if (upsertErr) throw upsertErr
      console.log('✅  dashboard_users profile upserted')
      console.log('\n🏁  Done! Log in at http://localhost:5173\n')
      process.exit(0)
    }
  }
  throw authError
}

const userId = authData.user.id
console.log(`✅  Auth user created (id: ${userId})`)

// 2. Insert into dashboard_users
const { error: profileError } = await supabase
  .from('dashboard_users')
  .upsert({ id: userId, email, full_name, role: 'admin' })

if (profileError) throw profileError
console.log('✅  dashboard_users profile inserted')
console.log('\n🏁  Done! Admin credentials:')
console.log(`    Email:    ${email}`)
console.log(`    Password: ${password}`)
console.log(`    Role:     admin\n`)
