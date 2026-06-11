#!/usr/bin/env node
/**
 * Applies all migrations by calling Supabase's pg-meta query API.
 * Run with:  node --env-file=.env scripts/run-migrations.mjs
 */
import { readFile, readdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const SECRET = process.env.SUPABASE_SECRET_KEY
const BASE   = process.env.VITE_SUPABASE_URL
const PROJECT = BASE.replace('https://', '').replace('.supabase.co', '')

if (!SECRET || SECRET.includes('xxxxxxxxx')) {
  console.error('❌  SUPABASE_SECRET_KEY not set in .env'); process.exit(1)
}

// Try multiple known Supabase SQL-execution endpoints in order
async function execSQL(sql) {
  const endpoints = [
    // pg-meta API (used by Supabase Studio)
    { url: `https://${PROJECT}.supabase.co/pg/query`, body: JSON.stringify({ query: sql }) },
    // Newer pg-meta path
    { url: `https://${PROJECT}.supabase.co/rest/v1/pg/query`, body: JSON.stringify({ query: sql }) },
  ]

  const headers = {
    apikey:          SECRET,
    Authorization:   `Bearer ${SECRET}`,
    'Content-Type':  'application/json',
    Prefer:          'return=representation',
  }

  for (const ep of endpoints) {
    const res = await fetch(ep.url, { method: 'POST', headers, body: ep.body })
    if (res.status !== 404) {
      const text = await res.text()
      return { status: res.status, body: text, endpoint: ep.url }
    }
  }

  // Fallback: use a raw pg connection via the service_role JWT
  // This approach works if the project has pg_meta enabled
  return { status: 404, body: 'No executable endpoint found', endpoint: 'none' }
}

const migrationsDir = join(__dir, '..', 'supabase', 'migrations')
const files = (await readdir(migrationsDir)).filter(f => f.endsWith('.sql')).sort()

console.log(`\n🗄  Applying ${files.length} migration(s) to project: ${PROJECT}\n`)

let allOk = true
for (const file of files) {
  const sql = await readFile(join(migrationsDir, file), 'utf8')
  process.stdout.write(`  → ${file} … `)
  const { status, body, endpoint } = await execSQL(sql)
  if (status === 200 || status === 201) {
    console.log('✅')
  } else {
    console.log(`⚠️  HTTP ${status} via ${endpoint}`)
    if (body && body.length < 300) console.log(`     ${body}`)
    allOk = false
  }
}

if (!allOk) {
  console.log('\n📋  Some migrations could not be applied automatically.')
  console.log('    Paste the contents of supabase/ALL_MIGRATIONS.sql in:')
  console.log(`    https://supabase.com/dashboard/project/${PROJECT}/sql/new\n`)
} else {
  console.log('\n🏁  All migrations applied.\n')
}
