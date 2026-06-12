#!/usr/bin/env node
/**
 * scripts/meetup-auth.js
 *
 * One-time OAuth2 setup for Meetup API access.
 * Run this ONCE to get your access_token + refresh_token.
 * Tokens are saved to .meetup-tokens.json and should be added to your .env.
 *
 * Usage:
 *   MEETUP_CLIENT_ID=xxx MEETUP_CLIENT_SECRET=yyy node --env-file=.env scripts/meetup-auth.js
 */

import http       from 'http'
import { exec }   from 'child_process'
import { readFileSync, writeFileSync } from 'fs'

const CLIENT_ID     = process.env.MEETUP_CLIENT_ID
const CLIENT_SECRET = process.env.MEETUP_CLIENT_SECRET
const REDIRECT_URI  = 'http://localhost:3333/callback'
const PORT          = 3333

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌  Set MEETUP_CLIENT_ID and MEETUP_CLIENT_SECRET in your .env')
  process.exit(1)
}

const authUrl = new URL('https://www.meetup.com/oauth2/authorize')
authUrl.searchParams.set('client_id',     CLIENT_ID)
authUrl.searchParams.set('redirect_uri',  REDIRECT_URI)
authUrl.searchParams.set('response_type', 'code')

console.log('\n🔐  Opening Meetup authorization page in your browser…')
console.log('    If it does not open automatically, visit:\n')
console.log('   ', authUrl.toString(), '\n')

// Open browser
exec(`open "${authUrl.toString()}"`)

// Temporary local server to capture the redirect
const server = http.createServer(async (req, res) => {
  const url  = new URL(req.url, `http://localhost:${PORT}`)
  const code = url.searchParams.get('code')

  if (!code) {
    res.writeHead(400)
    res.end('No code received. Please try again.')
    return
  }

  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end('<h2>✅ Authorized! You can close this tab and check your terminal.</h2>')
  server.close()

  console.log('✅  Authorization code received. Exchanging for tokens…\n')

  // Exchange code for tokens
  const tokenRes = await fetch('https://secure.meetup.com/oauth2/access', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type:    'authorization_code',
      redirect_uri:  REDIRECT_URI,
      code,
    }),
  })

  const tokens = await tokenRes.json()

  if (tokens.error) {
    console.error('❌  Token exchange failed:', tokens)
    process.exit(1)
  }

  console.log('✅  Tokens received!\n')
  console.log('   access_token:  ', tokens.access_token?.slice(0, 20) + '…')
  console.log('   refresh_token: ', tokens.refresh_token?.slice(0, 20) + '…')
  console.log('   expires_in:    ', tokens.expires_in, 'seconds\n')

  // Save to file
  writeFileSync('.meetup-tokens.json', JSON.stringify(tokens, null, 2))
  console.log('💾  Saved to .meetup-tokens.json\n')
  console.log('📋  Add these to your .env:\n')
  console.log(`    MEETUP_CLIENT_ID=${CLIENT_ID}`)
  console.log(`    MEETUP_CLIENT_SECRET=${CLIENT_SECRET}`)
  console.log(`    MEETUP_REFRESH_TOKEN=${tokens.refresh_token}\n`)
  console.log('🏁  Then add MEETUP_REFRESH_TOKEN to your Supabase Edge Function secrets.\n')
})

server.listen(PORT, () => {
  console.log(`   Listening for OAuth callback on http://localhost:${PORT}\n`)
})
