// ============================================================
// Map LinkedIn's native .xlsx analytics exports onto the
// { posts, daily } shape the import API expects.
//
// Two export types are recognised:
//
//   SinglePostAnalytics_<name>_<id>.xlsx
//     One sheet of "Label | Value" rows (Impressions, Reactions …)
//     followed by a demographics block. → one post record.
//
//   AggregateAnalytics_<name>_<from>_<to>.xlsx
//     ENGAGEMENT  Date | Impressions | Engagements   → daily rows
//     TOP POSTS   two side-by-side tables (by engagements and by
//                 impressions) that are sorted differently, merged
//                 here by post URL                    → post rows
//     DISCOVERY / FOLLOWERS / *DEMOGRAPHICS are informational only.
//
// Anything else falls back to the column-sniffing CSV detector so
// company-page exports with different sheet names still import.
// ============================================================

import { detectLinkedinCsv } from './linkedinCsv.js'

const norm = s => String(s ?? '').trim().toLowerCase()
const num  = v => { const n = Number(String(v ?? '').replace(/[,\s]/g, '')); return Number.isFinite(n) ? n : 0 }

/** "10/4/2026" (LinkedIn uses US month/day) → "2026-10-04"; null if not a date. */
export function usDate(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s ?? '').trim())
  if (!m) return null
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
}

/** "1:54 AM" → "01:54"; null if unparseable. */
function time24(s) {
  const m = /^(\d{1,2}):(\d{2})\s*([AP]M)?$/i.exec(String(s ?? '').trim())
  if (!m) return null
  let h = Number(m[1])
  if (m[3]) { const pm = m[3].toUpperCase() === 'PM'; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0 }
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

/**
 * Pull a stable id + readable title out of a LinkedIn post URL:
 * …/posts/<handle>_<slug>-(ugcPost|share|activity)-<id>-<suffix>
 */
export function postMeta(url) {
  const m = /\/posts\/[^/_]+_(.*?)-(ugcPost|share|activity)-(\d+)-[\w-]+\/?$/i.exec(String(url ?? ''))
  if (!m) return { post_id: url || null, title: null }
  const kind = m[2] === 'activity' ? 'activity' : m[2]
  return {
    post_id: `urn:li:${kind}:${m[3]}`,
    title: m[1].replace(/-+/g, ' ').trim() || null,
  }
}

// ---------- single post sheet ----------

function parseSinglePost(rows) {
  const kv = {}
  for (const r of rows) {
    const k = norm(r[0])
    if (k === 'category' || k === 'post viewer demographics') break   // demographics block starts
    if (k && r[1] !== undefined && String(r[1]).trim() !== '') kv[k] = String(r[1]).trim()
  }
  if (!kv['post url'] || kv['impressions'] === undefined) return null

  const date = usDate(kv['post date'])
  if (!date) throw new Error(`Could not read "Post Date" (${kv['post date'] ?? 'missing'})`)
  const time = time24(kv['post publish time'])
  const { post_id, title } = postMeta(kv['post url'])

  return {
    post_id,
    post_url: kv['post url'],
    title,
    published_at: time ? `${date}T${time}` : date,
    impressions:        num(kv['impressions']),
    unique_impressions: num(kv['members reached']),
    engagements:        num(kv['social engagements']),
    likes:    num(kv['reactions']),
    comments: num(kv['comments']),
    shares:   num(kv['reposts']),
    clicks:   num(kv['link engagements']),
  }
}

// ---------- aggregate: TOP POSTS ----------

function parseTopPosts(rows) {
  const hi = rows.findIndex(r => r.filter(c => /post url/i.test(c)).length >= 1 && r.some(c => /publish date|^date$/i.test(c)))
  if (hi < 0) return null
  const header = rows[hi].map(norm)

  // Each "post url" column starts a table; it runs until the next one.
  const starts = header.map((h, i) => (/post url/.test(h) ? i : -1)).filter(i => i >= 0)
  const tables = starts.map((s, k) => {
    const end = starts[k + 1] ?? header.length
    const cols = header.slice(s, end)
    const metric = cols.findIndex(c => c && !/post url|date/.test(c))
    return { url: s, date: s + cols.findIndex(c => /date/.test(c)), metric: metric >= 0 ? s + metric : -1,
             metricName: metric >= 0 ? cols[metric] : null }
  })

  const byUrl = new Map()
  for (const r of rows.slice(hi + 1)) {
    for (const t of tables) {
      const url = String(r[t.url] ?? '').trim()
      if (!/^https?:\/\//.test(url)) continue
      const rec = byUrl.get(url) ?? { ...postMeta(url), post_url: url, published_at: usDate(r[t.date]) }
      if (!rec.published_at) rec.published_at = usDate(r[t.date])
      if (t.metric >= 0 && t.metricName) {
        const key = /impression/.test(t.metricName) ? 'impressions'
                  : /engagement/.test(t.metricName) ? 'engagements'
                  : /reaction|like/.test(t.metricName) ? 'likes'
                  : /comment/.test(t.metricName) ? 'comments'
                  : /repost|share/.test(t.metricName) ? 'shares'
                  : /click/.test(t.metricName) ? 'clicks' : null
        if (key) rec[key] = num(r[t.metric])
      }
      byUrl.set(url, rec)
    }
  }
  return [...byUrl.values()].filter(p => p.published_at)
}

// ---------- aggregate: per-day sheets ----------

function parseDaily(rows) {
  const hi = rows.findIndex(r => r.some(c => /^date$/i.test(String(c).trim())) && r.some(c => /impression/i.test(c)))
  if (hi < 0) return null
  const header = rows[hi].map(norm)
  const col = {
    date:        header.findIndex(h => h === 'date'),
    impressions: header.findIndex(h => /impression/.test(h) && !/unique/.test(h)),
    unique:      header.findIndex(h => /unique|members reached/.test(h)),
    engagements: header.findIndex(h => /engagement/.test(h) && !/rate/.test(h)),
    likes:       header.findIndex(h => /reaction|like/.test(h)),
    comments:    header.findIndex(h => /comment/.test(h)),
    shares:      header.findIndex(h => /repost|share/.test(h)),
    clicks:      header.findIndex(h => /click/.test(h) && !/rate/.test(h)),
  }
  const get = (r, i) => (i >= 0 ? num(r[i]) : 0)
  const out = []
  for (const r of rows.slice(hi + 1)) {
    const date = usDate(r[col.date])
    if (!date) continue
    const rec = { date, impressions: get(r, col.impressions) }
    if (col.unique >= 0)      rec.unique_impressions = get(r, col.unique)
    if (col.engagements >= 0) rec.engagements = get(r, col.engagements)
    if (col.likes >= 0)       rec.likes = get(r, col.likes)
    if (col.comments >= 0)    rec.comments = get(r, col.comments)
    if (col.shares >= 0)      rec.shares = get(r, col.shares)
    if (col.clicks >= 0)      rec.clicks = get(r, col.clicks)
    out.push(rec)
  }
  return out
}

// ---------- entry point ----------

/**
 * @param {{ name: string, rows: string[][] }[]} sheets  from readXlsx()
 * @returns {{ posts: object[], daily: object[], notes: string[] }}
 */
export function parseLinkedinWorkbook(sheets) {
  const posts = new Map(), daily = new Map(), notes = []

  for (const { name, rows } of sheets) {
    if (!rows.length) continue

    const single = parseSinglePost(rows)
    if (single) { posts.set(single.post_url, single); notes.push(`${name}: 1 post`); continue }

    const top = parseTopPosts(rows)
    if (top) { for (const p of top) posts.set(p.post_url, { ...posts.get(p.post_url), ...p }); notes.push(`${name}: ${top.length} posts`); continue }

    const days = parseDaily(rows)
    if (days) { for (const d of days) daily.set(d.date, { ...daily.get(d.date), ...d }); notes.push(`${name}: ${days.length} days`); continue }

    // Unknown layout — let the CSV column sniffer have a go, quietly.
    try {
      const d = detectLinkedinCsv(rows.map(r => r.map(c => String(c ?? ''))))
      if (d.records.length) {
        if (d.mode === 'posts') { for (const p of d.records) posts.set(p.post_url || p.title, { ...postMeta(p.post_url), ...p }) }
        else                    { for (const r of d.records) { const date = usDate(r.date) ?? r.date; daily.set(date, { ...r, date }) } }
        notes.push(`${name}: ${d.records.length} ${d.mode === 'posts' ? 'posts' : 'days'}`)
      }
    } catch { /* informational sheet (DISCOVERY, FOLLOWERS, DEMOGRAPHICS …) */ }
  }

  if (!posts.size && !daily.size) {
    throw new Error(`No post or daily metrics found. Sheets: ${sheets.map(s => s.name).join(', ') || 'none'} — is this a LinkedIn analytics export?`)
  }
  return { posts: [...posts.values()], daily: [...daily.values()], notes }
}
