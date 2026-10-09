// ============================================================
// Map LinkedIn's analytics export (saved as CSV) onto the
// awareness_posts / awareness_daily shapes the import API expects.
//
// Two layouts are recognised by their columns:
//   posts — has a post URL / title column          → one row per post
//   daily — only a date + impressions column       → one row per day
// The header row is auto-detected (LinkedIn adds preamble lines).
// ============================================================

export function detectLinkedinCsv(rows) {
  const hi = rows.findIndex(r => r.some(c => /impression/i.test(c)))
  if (hi < 0) throw new Error('Could not find an "Impressions" column — is this a LinkedIn analytics export?')

  const header = rows[hi].map(h => String(h).trim().toLowerCase())
  const find = (re, not) => header.findIndex(h => re.test(h) && !(not && not.test(h)))
  const col = {
    date:        find(/publish|^date$|^date |created|^day$/),
    url:         find(/url|link/),
    title:       find(/title|post text|content|^post$/),
    impressions: find(/impression/, /unique/),
    unique:      find(/unique|members reached/),
    engagements: find(/engagement/, /rate/),
    likes:       find(/reaction|like/),
    comments:    find(/comment/),
    shares:      find(/repost|share/),
    clicks:      find(/click/, /rate/),
  }
  if (col.date < 0) throw new Error('Could not find a date column (e.g. "Post publish date" or "Date")')

  const mode = col.url >= 0 || col.title >= 0 ? 'posts' : 'daily'
  const get  = (r, i) => (i >= 0 ? (r[i] ?? '').trim() : '')

  const records = rows.slice(hi + 1).map(r => {
    const base = {
      impressions:        get(r, col.impressions),
      unique_impressions: get(r, col.unique),
      engagements:        get(r, col.engagements),
      likes:    get(r, col.likes),
      comments: get(r, col.comments),
      shares:   get(r, col.shares),
      clicks:   get(r, col.clicks),
    }
    return mode === 'posts'
      ? { ...base, published_at: get(r, col.date), post_url: get(r, col.url), title: get(r, col.title) }
      : { ...base, date: get(r, col.date) }
  }).filter(x => (x.published_at || x.date) && !Number.isNaN(Date.parse(x.published_at || x.date)))

  return { mode, header: rows[hi], records }
}
