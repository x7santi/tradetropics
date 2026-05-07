import type { CalendarEvent } from './confidence'
import { useSettingsStore } from '@renderer/store/settingsStore'

// ── Date helpers ─────────────────────────────────────────────────────────────

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Parse YYYY-MM-DD as a UTC calendar date (no local TZ drift). */
function parseISODateParts(s: string): { y: number; m: number; d: number } | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
}

function compareISODate(a: string, b: string): number {
  return a.localeCompare(b)
}

function addDaysToISODate(s: string, deltaDays: number): string | null {
  const p = parseISODateParts(s)
  if (!p) return null
  const t = Date.UTC(p.y, p.m - 1, p.d) + deltaDays * 86_400_000
  const d = new Date(t)
  return toDateStr(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

/**
 * Trading Economics often truncates long from/to windows (guest + some tiers).
 * Request the visible range in small slices so late-month / spillover days still get data.
 */
const CALENDAR_CHUNK_DAYS = 10

function pickStr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k]
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v)
  }
  return ''
}

function pickNum(obj: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = obj[k]
    if (v === undefined || v === null) continue
    const n = Number(v)
    if (!Number.isNaN(n)) return n
  }
  return NaN
}

// ── Impact boost (TradingEconomics often marks CPI/PPI / speeches as Importance 1) ──

const HIGH_MACRO_RES: RegExp[] = [
  /\bconsumer\s+price(\s+index)?\b/i,
  /\bcpi\b/i,
  /\bcore\s+cpi\b/i,
  /\bpce\s+(?:price|inflation)\b/i,
  /\binflation\s+rate\b/i,
  /\bnon[-\s]?farm\b/i,
  /\bemployment\s+situation\b/i,
  /\bnfp\b/i,
  /\bfomc\b/i,
  /\bfed(?:eral\s+reserve)?\s+interest\s+rate/i,
  /\binterest\s+rate\s+decision\b/i,
  /\bmonetary\s+policy\s+(?:decision|statement)\b/i,
]

const MEDIUM_MACRO_RES: RegExp[] = [
  /\bppi\b/i,
  /\bproducer\s+price\b/i,
  /\bgdp\b/i,
  /\bgross\s+domestic\s+product\b/i,
  /\bretail\s+sales\b/i,
  /\bjobless\s+claims\b/i,
  /\bcontinuing\s+claims\b/i,
  /\badp\s+(?:national\s+)?employment\b/i,
  /\bism\s+(?:manufacturing|services|non[-\s]?manufacturing)\b/i,
  /\bpmi\b/i,
  /\bdurable\s+goods\b/i,
  /\bhousing\s+starts\b/i,
  /\bbuilding\s+permits?\b/i,
  /\bconsumer\s+confidence\b/i,
  /\bphiladelphia\s+fed\b/i,
  /\bindustrial\s+production\b/i,
  /\btrade\s+balance\b/i,
  /\bcurrent\s+account\b/i,
  /\btreasury\s+(?:statement|auction)\b/i,
  /\bwhite\s+house\b/i,
  /\bcongressional\s+testimony\b/i,
  /\b(powell|lagarde|bailey|ueda|macklem)\b/i,
  /\b(?:ecb|boe|boj|boc|rba|rbnz|fed|fomc)\b.{0,48}\b(?:speech|speaks|remarks|testimony|minutes|press\s+conference|statement)\b/i,
  /\b(?:speech|remarks|testimony|press\s+conference)\b.{0,48}\b(?:ecb|boe|boj|boc|federal\s+reserve|fed\s+chair|president)\b/i,
  /\bpresident\b.{0,32}\b(?:speech|address|remarks|speaks)\b/i,
]

const HOLIDAY_RES = /\b(bank\s+holiday|market\s+holiday|public\s+holiday|trading\s+holiday|early\s+close|market\s+closed)\b/i

function applyMacroImpactBoost(
  title: string,
  category: string,
  impact: CalendarEvent['impact'],
): CalendarEvent['impact'] {
  const cat = category.toLowerCase()
  const blob = `${title}\n${category}`.toLowerCase()

  if (impact === 'Holiday' || cat.includes('holiday') || HOLIDAY_RES.test(blob)) return 'Holiday'

  for (const re of HIGH_MACRO_RES) {
    if (re.test(blob)) return 'High'
  }

  if (impact === 'Low') {
    for (const re of MEDIUM_MACRO_RES) {
      if (re.test(blob)) return 'Medium'
    }
  }

  return impact
}

// ── TradingEconomics API (https://docs.tradingeconomics.com/economic_calendar/snapshot/) ──
// Best overall macro calendar (CPI, PPI, CB speeches, holidays). Paid key strongly recommended;
// guest access is intentionally limited.

function tradingEconomicsCredential(): string {
  const key = useSettingsStore.getState().tradingEconomicsApiKey.trim()
  if (key) return key
  const env = (import.meta.env.VITE_TRADING_ECONOMICS_API_KEY as string | undefined)?.trim()
  if (env) return env
  return 'guest:guest'
}

async function fetchTradingEconomics(from: string, to: string): Promise<Record<string, unknown>[]> {
  const c = tradingEconomicsCredential()
  const url =
    `https://api.tradingeconomics.com/calendar?from=${encodeURIComponent(from)}` +
    `&to=${encodeURIComponent(to)}&f=json&c=${encodeURIComponent(c)}`

  const fetcher = window.nativeFetch?.fetch
    ? (u: string) => window.nativeFetch.fetch(u)
    : (u: string) => fetch(u).then((r) => r.text())

  try {
    const body = await fetcher(url)
    const data: unknown = typeof body === 'string' ? JSON.parse(body) : body
    if (!Array.isArray(data)) return []
    return data as Record<string, unknown>[]
  } catch {
    return []
  }
}

async function fetchTradingEconomicsRange(fromStr: string, toStr: string): Promise<Record<string, unknown>[]> {
  if (compareISODate(fromStr, toStr) > 0) return []

  const seen = new Set<string>()
  const merged: Record<string, unknown>[] = []

  let sliceFrom = fromStr
  while (compareISODate(sliceFrom, toStr) <= 0) {
    const sliceEnd = addDaysToISODate(sliceFrom, CALENDAR_CHUNK_DAYS - 1)
    if (!sliceEnd) break
    const chunkTo = compareISODate(sliceEnd, toStr) > 0 ? toStr : sliceEnd

    const rows = await fetchTradingEconomics(sliceFrom, chunkTo)
    for (const row of rows) {
      const id = pickStr(row, 'CalendarId', 'calendarId')
      if (id) {
        if (seen.has(`id:${id}`)) continue
        seen.add(`id:${id}`)
      } else {
        const d = pickStr(row, 'Date', 'date')
        const ev = pickStr(row, 'Event', 'event')
        const fk = `fk:${d}|${ev}`
        if (seen.has(fk)) continue
        seen.add(fk)
      }
      merged.push(row)
    }

    const next = addDaysToISODate(chunkTo, 1)
    if (!next || compareISODate(next, toStr) > 0) break
    sliceFrom = next
  }

  return merged
}

// ── Finnhub economic calendar (optional second source) ──────────────────────
// https://finnhub.io/docs/api/economic-calendar — set VITE_FINNHUB_API_KEY in .env

function finnhubCountryToCcy(raw: string): string {
  const u = raw.trim().toUpperCase()
  if (u.length === 3 && /^[A-Z]{3}$/.test(u)) return u
  const ISO2: Record<string, string> = {
    US: 'USD', GB: 'GBP', UK: 'GBP', EU: 'EUR', EZ: 'EUR', EMU: 'EUR',
    DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR',
    JP: 'JPY', CN: 'CNY', CA: 'CAD', AU: 'AUD', NZ: 'NZD', CH: 'CHF', SE: 'SEK',
    NO: 'NOK', DK: 'DKK', KR: 'KRW', IN: 'INR', MX: 'MXN', BR: 'BRL', RU: 'RUB',
    ZA: 'ZAR', SG: 'SGD', HK: 'HKD', TW: 'TWD', PL: 'PLN', TR: 'TRY', ID: 'IDR',
  }
  return ISO2[u] ?? u
}

async function fetchFinnhubEconomic(from: string, to: string): Promise<Record<string, unknown>[]> {
  const token = (import.meta.env.VITE_FINNHUB_API_KEY as string | undefined)?.trim()
  if (!token) return []

  const url =
    `https://finnhub.io/api/v1/calendar/economic?from=${encodeURIComponent(from)}` +
    `&to=${encodeURIComponent(to)}&token=${encodeURIComponent(token)}`

  const fetcher = window.nativeFetch?.fetch
    ? (u: string) => window.nativeFetch.fetch(u)
    : (u: string) => fetch(u).then((r) => r.text())

  try {
    const body = await fetcher(url)
    const data: unknown = typeof body === 'string' ? JSON.parse(body) : body
    const rec = data as Record<string, unknown>
    const list = rec.economicCalendar ?? rec.economic_calendar
    if (!Array.isArray(list)) return []
    return list as Record<string, unknown>[]
  } catch {
    return []
  }
}

async function fetchFinnhubEconomicRange(fromStr: string, toStr: string): Promise<Record<string, unknown>[]> {
  const token = (import.meta.env.VITE_FINNHUB_API_KEY as string | undefined)?.trim()
  if (!token) return []
  if (compareISODate(fromStr, toStr) > 0) return []

  const seen = new Set<string>()
  const merged: Record<string, unknown>[] = []

  let sliceFrom = fromStr
  while (compareISODate(sliceFrom, toStr) <= 0) {
    const sliceEnd = addDaysToISODate(sliceFrom, CALENDAR_CHUNK_DAYS - 1)
    if (!sliceEnd) break
    const chunkTo = compareISODate(sliceEnd, toStr) > 0 ? toStr : sliceEnd

    const rows = await fetchFinnhubEconomic(sliceFrom, chunkTo)
    for (const row of rows) {
      const ev = pickStr(row, 'event', 'Event')
      const t = pickStr(row, 'time', 'date', 'Time', 'Date')
      const fk = `${t}|${ev}`
      if (seen.has(fk)) continue
      seen.add(fk)
      merged.push(row)
    }

    const next = addDaysToISODate(chunkTo, 1)
    if (!next || compareISODate(next, toStr) > 0) break
    sliceFrom = next
  }

  return merged
}

function mapFinnhubItem(item: Record<string, unknown>): CalendarEvent | null {
  const title = pickStr(item, 'event', 'Event')
  if (!title) return null

  const dateRaw = pickStr(item, 'time', 'date', 'Time', 'Date')
  const timestamp = dateRaw ? Date.parse(dateRaw.replace(' ', 'T')) : NaN
  if (Number.isNaN(timestamp)) return null

  const country = finnhubCountryToCcy(pickStr(item, 'country', 'Country'))

  const impRaw = pickStr(item, 'impact', 'Impact').toLowerCase()
  let impact: CalendarEvent['impact'] = 'Low'
  if (impRaw.includes('high')) impact = 'High'
  else if (impRaw.includes('medium')) impact = 'Medium'
  else if (impRaw.includes('holiday')) impact = 'Holiday'

  const category = pickStr(item, 'category', 'Category')
  impact = applyMacroImpactBoost(title, category, impact)

  return { title, country, timestamp, impact }
}

function mapTEItem(item: Record<string, unknown>): CalendarEvent | null {
  const title = pickStr(item, 'Event', 'event', 'title', 'description')
  if (!title) return null

  const dateRaw = pickStr(item, 'Date', 'date', 'datetime', 'calendarDate', 'eventDate')
  const timestamp = dateRaw ? Date.parse(dateRaw) : NaN
  if (Number.isNaN(timestamp)) return null

  const rawCountry = pickStr(item, 'Country', 'country', 'country_code', 'iso')
  const ccyRaw = pickStr(item, 'Currency', 'currency').toUpperCase()

  const COUNTRY_TO_CCY: Record<string, string> = {
    'UNITED STATES': 'USD', US: 'USD', USA: 'USD',
    'UNITED KINGDOM': 'GBP', UK: 'GBP', 'GREAT BRITAIN': 'GBP', BRITAIN: 'GBP',
    'EURO AREA': 'EUR', EUROZONE: 'EUR', GERMANY: 'EUR', FRANCE: 'EUR', SPAIN: 'EUR', ITALY: 'EUR',
    JAPAN: 'JPY', AUSTRALIA: 'AUD', CANADA: 'CAD', SWITZERLAND: 'CHF', 'NEW ZEALAND': 'NZD', CHINA: 'CNY',
    SWEDEN: 'SEK', NORWAY: 'NOK', DENMARK: 'DKK', 'SOUTH KOREA': 'KRW', KOREA: 'KRW', INDIA: 'INR', MEXICO: 'MXN',
    BRAZIL: 'BRL', RUSSIA: 'RUB', TURKEY: 'TRY', SINGAPORE: 'SGD', 'HONG KONG': 'HKD',
  }

  let country = rawCountry.toUpperCase()
  if (/^[A-Z]{3}$/.test(ccyRaw)) country = ccyRaw
  else if (COUNTRY_TO_CCY[country]) country = COUNTRY_TO_CCY[country]
  else if (/^[A-Z]{3}$/.test(country)) country = country

  let impact: CalendarEvent['impact'] = 'Low'
  const impNum = pickNum(item, 'Importance', 'importance', 'relevance', 'importance_level', 'importanceLevel')
  if (!Number.isNaN(impNum)) {
    impact = impNum >= 3 ? 'High' : impNum === 2 ? 'Medium' : 'Low'
  } else {
    const impStr = pickStr(item, 'impact', 'Impact').toLowerCase()
    if (impStr.includes('high')) impact = 'High'
    else if (impStr.includes('medium')) impact = 'Medium'
    else if (impStr.includes('holiday')) impact = 'Holiday'
  }

  const category = pickStr(item, 'Category', 'category')
  if (category.toLowerCase().includes('holiday') || title.toLowerCase().includes('holiday')) impact = 'Holiday'

  impact = applyMacroImpactBoost(title, category, impact)

  return { title, country, timestamp, impact }
}

function eventDedupeKey(ev: CalendarEvent): string {
  const d = new Date(ev.timestamp)
  const day = toDateStr(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
  const normTitle = ev.title.toLowerCase().replace(/\s+/g, ' ').trim()
  return `${day}|${ev.country}|${normTitle}`
}

async function fetchMergedEvents(fromStr: string, toStr: string): Promise<CalendarEvent[]> {
  const [teRows, fhRows] = await Promise.all([
    fetchTradingEconomicsRange(fromStr, toStr),
    fetchFinnhubEconomicRange(fromStr, toStr),
  ])

  const out: CalendarEvent[] = []
  for (const row of teRows) {
    const ev = mapTEItem(row)
    if (ev) out.push(ev)
  }
  for (const row of fhRows) {
    const ev = mapFinnhubItem(row)
    if (ev) out.push(ev)
  }

  const seen = new Set<string>()
  const deduped: CalendarEvent[] = []
  for (const ev of out) {
    const k = eventDedupeKey(ev)
    if (seen.has(k)) continue
    seen.add(k)
    deduped.push(ev)
  }

  return deduped
}

function filterCalendarRelevance(events: CalendarEvent[]): CalendarEvent[] {
  return events
    .filter((e) => e.impact === 'High' || e.impact === 'Medium' || e.impact === 'Holiday')
    .sort((a, b) => a.timestamp - b.timestamp)
}

async function fetchGrouped(fromStr: string, toStr: string): Promise<Record<string, CalendarEvent[]>> {
  const merged = await fetchMergedEvents(fromStr, toStr)
  const grouped: Record<string, CalendarEvent[]> = {}

  for (const ev of filterCalendarRelevance(merged)) {
    const d = new Date(ev.timestamp)
    const key = toDateStr(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(ev)
  }

  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a, b) => a.timestamp - b.timestamp)
  }

  return grouped
}

// ── Public: Dashboard confidence feed ─────────────────────────────────────────

export async function fetchCalendarEvents(): Promise<CalendarEvent[]> {
  const now = new Date()
  const from = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
  const to = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  const fromStr = toDateStr(from.getUTCFullYear(), from.getUTCMonth() + 1, from.getUTCDate())
  const toStr = toDateStr(to.getUTCFullYear(), to.getUTCMonth() + 1, to.getUTCDate())

  const merged = await fetchMergedEvents(fromStr, toStr)
  return filterCalendarRelevance(merged)
}

// ── Public: Calendar page (arbitrary UTC date range, inclusive) ──────────────

export async function fetchCalendarEventsGrouped(
  fromStr: string,
  toStr: string,
): Promise<Record<string, CalendarEvent[]>> {
  return fetchGrouped(fromStr, toStr)
}
