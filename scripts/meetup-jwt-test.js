#!/usr/bin/env node
import crypto from 'crypto'
import { readFileSync } from 'fs'

const CLIENT_ID      = process.env.MEETUP_CLIENT_ID
const MEMBER_ID      = process.env.MEETUP_MEMBER_ID
const SIGNING_KEY_ID = process.env.MEETUP_SIGNING_KEY_ID
const GROUP          = process.env.MEETUP_GROUP_URLNAME
const PRIVATE_KEY    = readFileSync('.meetup-private-key.pem', 'utf8')

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')
}

function signJWT() {
  const header  = { kid: SIGNING_KEY_ID, typ: 'JWT', alg: 'RS256' }
  const now     = Math.floor(Date.now() / 1000)
  const payload = { sub: MEMBER_ID, iss: CLIENT_ID, aud: 'api.meetup.com', iat: now, exp: now + 120 }
  const signing = `${base64url(Buffer.from(JSON.stringify(header)))}.${base64url(Buffer.from(JSON.stringify(payload)))}`
  const sig     = crypto.createSign('RSA-SHA256')
  sig.update(signing)
  return `${signing}.${base64url(sig.sign(PRIVATE_KEY))}`
}

console.log('\n🔐  Signing JWT...')
const jwt = signJWT()
console.log('   JWT built ✓')

console.log('🔄  Exchanging for access token...')
const tokenRes = await fetch('https://secure.meetup.com/oauth2/access', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion:  jwt,
  }),
})
const tokens = await tokenRes.json()

if (!tokens.access_token) {
  console.error('❌  Token exchange failed:', JSON.stringify(tokens, null, 2))
  process.exit(1)
}
console.log('✅  Access token obtained! Expires in:', tokens.expires_in, 'seconds\n')

console.log(`🔍  Querying group "${GROUP}"...`)
const gqlRes = await fetch('https://api.meetup.com/gql-ext', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `query($urlname:String!){groupByUrlname(urlname:$urlname){id name upcomingEvents(input:{first:3}){edges{node{id title dateTime}}}}}`,
    variables: { urlname: GROUP },
  }),
})
const gql = await gqlRes.json()

if (gql.errors) { console.error('❌  GraphQL errors:', JSON.stringify(gql.errors, null, 2)); process.exit(1) }

const group = gql.data?.groupByUrlname
console.log(`✅  Group: "${group?.name}"`)
const events = group?.upcomingEvents?.edges ?? []
console.log(`   Upcoming events: ${events.length}`)
events.forEach(e => console.log(`     - ${e.node.title} (${e.node.dateTime})`))
console.log('\n🏁  JWT auth working! Ready to deploy.\n')
