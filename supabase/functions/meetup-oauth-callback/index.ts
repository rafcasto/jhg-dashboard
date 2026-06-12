/**
 * meetup-oauth-callback — Supabase Edge Function
 * Re-authorise with explicit scopes: basic + event_management + reporting
 */

const CLIENT_ID     = Deno.env.get('MEETUP_CLIENT_ID')!
const CLIENT_SECRET = Deno.env.get('MEETUP_CLIENT_SECRET')!
const REDIRECT_URI  = 'https://rizumeeeqojhxhaskbmx.supabase.co/functions/v1/meetup-oauth-callback'

Deno.serve(async (req: Request) => {
  const url  = new URL(req.url)
  const code = url.searchParams.get('code')
  const err  = url.searchParams.get('error')

  if (!code && !err) {
    const authUrl = new URL('https://secure.meetup.com/oauth2/authorize')
    authUrl.searchParams.set('client_id',     CLIENT_ID)
    authUrl.searchParams.set('redirect_uri',  REDIRECT_URI)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope',         'basic event_management reporting agora')
    return Response.redirect(authUrl.toString(), 302)
  }

  if (err) return html(`<h2>❌ Denied</h2><pre>${err}</pre>`)

  const tokenRes = await fetch('https://secure.meetup.com/oauth2/access', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type:    'authorization_code',
      redirect_uri:  REDIRECT_URI,
      code:          code!,
    }),
  })

  const tokens = await tokenRes.json() as Record<string, string>
  if (tokens.error || !tokens.refresh_token) {
    return html(`<h2>❌ Token exchange failed</h2><pre>${JSON.stringify(tokens, null, 2)}</pre>`)
  }

  return html(`
    <!DOCTYPE html><html>
    <head><title>Meetup OAuth - JHG</title>
    <style>
      body{font-family:-apple-system,sans-serif;max-width:700px;margin:60px auto;padding:0 20px;background:#0f1117;color:#e8e8e8}
      h2{color:#6bbf6b}.card{background:#1a1d2a;border-radius:12px;padding:24px;margin:20px 0}
      label{display:block;font-size:12px;color:#888;margin-bottom:6px;text-transform:uppercase}
      .token{background:#0f1117;border:1px solid #333;border-radius:8px;padding:12px;font-family:monospace;font-size:12px;word-break:break-all;cursor:pointer}
      .token:hover{border-color:#c2001f}.hint{font-size:11px;color:#555;margin-top:6px}
      .scope{background:#1a2a1a;padding:8px 12px;border-radius:6px;font-family:monospace;font-size:12px;color:#6bbf6b}
    </style></head>
    <body>
      <h2>OAuth Success!</h2>
      <div class="card">
        <label>Scope granted</label>
        <div class="scope">${tokens.scope ?? '(none — Meetup may not return scope)'}</div>
      </div>
      <div class="card">
        <label>MEETUP_REFRESH_TOKEN</label>
        <div class="token" onclick="navigator.clipboard.writeText('${tokens.refresh_token}');this.style.borderColor='#6bbf6b'">${tokens.refresh_token}</div>
        <div class="hint">Click to copy</div>
      </div>
      <div class="card">
        <label>MEETUP_ACCESS_TOKEN (1 hour)</label>
        <div class="token" onclick="navigator.clipboard.writeText('${tokens.access_token}');this.style.borderColor='#6bbf6b'">${tokens.access_token}</div>
        <div class="hint">Click to copy</div>
      </div>
      <p style="color:#555;font-size:12px;margin-top:40px">Close this tab when done.</p>
    </body></html>
  `)
})

function html(c: string): Response {
  return new Response(c, { headers: { 'Content-Type': 'text/html' } })
}
