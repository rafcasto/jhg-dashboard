// ============================================================
// Minimal .xlsx reader — no dependencies.
//
// Reads the zip container with DataView and inflates entries with
// the platform's DecompressionStream ('deflate-raw'), then pulls
// cell text out of the sheet XML with regexes. Enough for simple
// exports (LinkedIn analytics, etc.): shared strings, inline
// strings, numbers, booleans. Formulas return their cached value.
// Not a general spreadsheet engine — no styles, merges or dates
// (date cells stored as serial numbers come back as the number).
// ============================================================

const SIG_EOCD = 0x06054b50
const SIG_CEN  = 0x02014b50
const utf8     = new TextDecoder('utf-8')

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Open a zip and return a lazy `read(name)` that yields the entry as text. */
function openZip(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (dv.getUint32(i, true) === SIG_EOCD) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Not a .xlsx file (zip directory not found)')

  const count = dv.getUint16(eocd + 10, true)
  let p = dv.getUint32(eocd + 16, true)
  const entries = new Map()
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== SIG_CEN) break
    const method = dv.getUint16(p + 10, true)
    const csize  = dv.getUint32(p + 20, true)
    const nlen   = dv.getUint16(p + 28, true)
    const elen   = dv.getUint16(p + 30, true)
    const clen   = dv.getUint16(p + 32, true)
    const locOff = dv.getUint32(p + 42, true)
    entries.set(utf8.decode(buf.subarray(p + 46, p + 46 + nlen)), { method, csize, locOff })
    p += 46 + nlen + elen + clen
  }

  return {
    names: [...entries.keys()],
    async read(name) {
      const e = entries.get(name)
      if (!e) return null
      const nlen  = dv.getUint16(e.locOff + 26, true)
      const elen  = dv.getUint16(e.locOff + 28, true)
      const start = e.locOff + 30 + nlen + elen
      const data  = buf.subarray(start, start + e.csize)
      if (e.method === 0) return utf8.decode(data)
      if (e.method === 8) return utf8.decode(await inflateRaw(data))
      throw new Error(`Unsupported zip compression method ${e.method}`)
    },
  }
}

// ---------- XML helpers (regex-based; the OOXML we need is flat) ----------

function unescapeXml(s) {
  return String(s ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}

function attrs(tag) {
  const out = {}
  for (const m of tag.matchAll(/([\w:]+)="([^"]*)"/g)) out[m[1]] = unescapeXml(m[2])
  return out
}

/** Join every <t> inside a rich-text run (<si> or <is>). */
function textRuns(xml) {
  let s = ''
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) s += unescapeXml(m[1])
  return s
}

function colIndex(ref) {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A'
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function parseSheet(xml, shared) {
  const rows = []
  for (const rm of xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
    const cells = []
    for (const cm of rm[1].matchAll(/<c(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = attrs(cm[1] ?? '')
      const body = cm[2] ?? ''
      const idx = a.r ? colIndex(a.r) : cells.length
      let val = ''
      if (a.t === 'inlineStr') {
        val = textRuns(body)
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
        if (v !== undefined) {
          if (a.t === 's')      val = shared[Number(v)] ?? ''
          else if (a.t === 'b') val = v === '1' ? 'TRUE' : 'FALSE'
          else                  val = unescapeXml(v)
        }
      }
      while (cells.length < idx) cells.push('')
      cells[idx] = val
    }
    rows.push(cells)
  }
  // Drop blank rows, same as parseCSV.
  return rows.filter(r => r.some(x => String(x).trim() !== ''))
}

/**
 * Read a workbook.
 * @param {File|Blob|ArrayBuffer|Uint8Array} input
 * @returns {Promise<{ name: string, rows: string[][] }[]>} sheets in workbook order
 */
export async function readXlsx(input) {
  let buf
  if (input instanceof Uint8Array)       buf = input
  else if (input instanceof ArrayBuffer) buf = new Uint8Array(input)
  else                                   buf = new Uint8Array(await input.arrayBuffer())

  const zip = openZip(buf)
  const wbXml = await zip.read('xl/workbook.xml')
  if (!wbXml) throw new Error('Not a .xlsx file (xl/workbook.xml missing)')

  const rels = {}
  for (const m of (await zip.read('xl/_rels/workbook.xml.rels') ?? '').matchAll(/<Relationship\s[^>]*\/?>/g)) {
    const a = attrs(m[0])
    rels[a.Id] = a.Target
  }

  const shared = []
  const ssXml = await zip.read('xl/sharedStrings.xml')
  if (ssXml) for (const m of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textRuns(m[1]))

  const sheets = []
  for (const m of wbXml.matchAll(/<sheet\s[^>]*\/?>/g)) {
    const a = attrs(m[0])
    const target = rels[a['r:id']] ?? ''
    const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\/?xl\//, '')
    const xml = await zip.read(path)
    sheets.push({ name: a.name ?? path, rows: xml ? parseSheet(xml, shared) : [] })
  }
  return sheets
}
