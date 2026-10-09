// ============================================================
// Date-window maths for experiments.
//
// An experiment has a POSTING window (start_date → end_date, or
// → today while ongoing) and a BASELINE window of equal length
// (or `baseline_days`) immediately before it. Impact = after vs before.
// All dates are 'YYYY-MM-DD' strings handled in UTC.
// ============================================================

const DAY = 86400000

export const isoDay = d => new Date(d).toISOString().slice(0, 10)
export const today  = () => isoDay(new Date())

export function addDays(date, n) {
  return isoDay(Date.parse(`${date}T00:00:00Z`) + n * DAY)
}

/** Inclusive number of days between two ISO dates. */
export function daysBetween(start, end) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY) + 1
}

export function fillDays(start, end) {
  const out = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}

export function experimentWindow(exp, now = today()) {
  const postStart = exp.start_date
  const postEnd   = exp.end_date && exp.end_date < now ? exp.end_date : now
  const postDays  = Math.max(1, daysBetween(postStart, postEnd))
  const baseDays  = exp.baseline_days || postDays
  const baseEnd   = addDays(postStart, -1)
  const baseStart = addDays(baseEnd, -(baseDays - 1))
  return {
    postStart, postEnd, postDays, baseStart, baseEnd, baseDays,
    ongoing:  !exp.end_date || exp.end_date >= now,
    upcoming: postStart > now,
  }
}

/** Sum `field` over rows whose `date` lies in [start, end]. */
export function sumRange(rows, start, end, field) {
  let total = 0
  for (const r of rows) if (r.date >= start && r.date <= end) total += Number(r[field] ?? 0)
  return total
}

export function pctChange(before, after) {
  if (!before) return null
  return ((after - before) / before) * 100
}

export function formatDate(d) {
  if (!d) return 'ongoing'
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

export const fmtNum = n => (n ?? 0).toLocaleString()
