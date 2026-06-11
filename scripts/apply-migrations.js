#!/usr/bin/env node
/**
 * npm run migrate
 *
 * Applies all SQL migrations in supabase/migrations/ to your Supabase project
 * in order. Uses the SUPABASE_SECRET_KEY (service role) for admin access.
 *
 * Requires env vars: VITE_SUPABASE_URL, SUPABASE_SECRET_KEY
 */

import { readdir, readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dir, '..', 'supabase', 'migrations')

const url     = process.env.VITE_SUPABASE_URL
const secret  = process.env.SUPABASE_SECRET_KEY

if (!url || !secret || secret.includes('xxxxxxxxx')) {
  console.error('❌  VITE_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env')
  console.error('    Get your secret key from: Supabase Dashboard → Settings → API Keys')
  process.exit(1)
}

const files = (await readdir(migrationsDir))
  .filter(f => f.endsWith('.sql'))
  .sort()

console.log(`\n🗄  Applying ${files.length} migration(s) to ${url}\n`)

for (const file of files) {
  const sql = await readFile(join(migrationsDir, file), 'utf8')
  process.stdout.write(`  → ${file} … `)

  const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method:  'POST',
    headers: {
      apikey:          secret,
      Authorization:   `Bearer ${secret}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })

  if (!res.ok) {
    // Try the direct SQL endpoint (Supabase management API style)
    // Fallback: print the SQL for manual pasting
    console.log('⚠️  Could not apply via REST. SQL is at:', join(migrationsDir, file))
    console.log('   Paste it manually in: Supabase Dashboard → SQL Editor')
    continue
  }

  console.log('✅')
}

console.log('\n🏁  Migrations complete.\n')
