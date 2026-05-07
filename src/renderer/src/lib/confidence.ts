import type { Candle } from './finnhub'

// ── Public types ──────────────────────────────────────────────────────────────

export interface CalendarEvent {
  title: string
  country: string   // e.g. "USD", "EUR"
  timestamp: number // unix ms
  impact: 'High' | 'Medium' | 'Low' | 'Holiday'
}

export interface EntryScoreResult {
  score: number
  label: string
  reason: string
  analysis: string       // short 2-3 sentence (ConfidenceMeter sidebar)
  deepAnalysis: string[] // extensive paragraphs for Analysis Report
  components: {
    trendScore: number
    volatilityScore: number
    newsScore: number
  }
  // technical snapshot
  rsi: number | null
  ema20: number | null
  currentPrice: number | null
  support: number | null
  resistance: number | null
  direction: 'up' | 'down' | 'flat'
  biasInterval: string   // which timeframe the direction came from
  atr: number | null
  // news split
  upcomingEvents: CalendarEvent[]
  recentEvents: CalendarEvent[]
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function formatMinutes(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60)
    const m = Math.round(minutes % 60)
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  return `${Math.round(minutes)}m`
}

// ── Component 1: Trend quality (reversal count) ───────────────────────────────
function computeTrendScore(candles: Candle[]): { score: number; direction: 'up' | 'down' | 'flat' } {
  if (candles.length < 5) return { score: 50, direction: 'flat' }

  const recent = candles.slice(-14)

  let reversals = 0
  for (let i = 2; i < recent.length; i++) {
    const prev = recent[i - 1].close - recent[i - 2].close
    const curr = recent[i].close - recent[i - 1].close
    if (prev !== 0 && curr !== 0 && Math.sign(prev) !== Math.sign(curr)) reversals++
  }

  const maxReversals = recent.length - 2
  const chopRatio = reversals / maxReversals
  const score = clamp(Math.round(100 - chopRatio * 130), 0, 100)

  // EMA20 vs current price — reliable across all timeframes (0.1% band avoids noise)
  let direction: 'up' | 'down' | 'flat' = 'flat'
  const period = 20
  if (candles.length >= period) {
    const k = 2 / (period + 1)
    let ema = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period
    for (let i = period; i < candles.length; i++) ema = candles[i].close * k + ema * (1 - k)
    const price = candles[candles.length - 1].close
    direction = price > ema * 1.001 ? 'up' : price < ema * 0.999 ? 'down' : 'flat'
  } else {
    const first = recent[0].close
    const last  = recent[recent.length - 1].close
    direction = last > first * 1.001 ? 'up' : last < first * 0.999 ? 'down' : 'flat'
  }

  return { score, direction }
}

export function computeDirectionOnly(candles: Candle[]): 'up' | 'down' | 'flat' {
  return computeTrendScore(candles).direction
}

// ── Component 2: Volatility level (ATR ratio) ─────────────────────────────────
function computeVolatilityScore(candles: Candle[]): number {
  if (candles.length < 6) return 50

  const ranges = candles.map(c => c.close > 0 ? (c.high - c.low) / c.close : 0)
  const baseline = ranges.slice(0, -4).reduce((a, b) => a + b, 0) / Math.max(ranges.length - 4, 1)
  const recent   = ranges.slice(-4).reduce((a, b) => a + b, 0) / 4

  if (baseline === 0) return 50

  const ratio = recent / baseline

  if (ratio > 2.0) return clamp(Math.round(100 - 80 * (ratio - 1)), 0, 100)
  if (ratio > 1.4) return clamp(Math.round(100 - 50 * (ratio - 1)), 0, 100)
  if (ratio < 0.3) return 60
  return clamp(Math.round(100 - 20 * Math.abs(ratio - 1.0)), 0, 100)
}

// ── Component 3: News proximity ───────────────────────────────────────────────

// Forex pairs → relevant currencies. Stocks and crypto default to USD.
const SYMBOL_CURRENCIES: Record<string, string[]> = {
  'EUR/USD': ['EUR', 'USD'], 'GBP/USD': ['GBP', 'USD'],
  'USD/JPY': ['USD', 'JPY'], 'AUD/USD': ['AUD', 'USD'],
  'USD/CAD': ['USD', 'CAD'], 'USD/CHF': ['USD', 'CHF'],
  'NZD/USD': ['NZD', 'USD'], 'EUR/JPY': ['EUR', 'JPY'],
  'GBP/JPY': ['GBP', 'JPY'], 'EUR/GBP': ['EUR', 'GBP'],
  'BTC/USD': ['USD'], 'ETH/USD': ['USD'],
  'SOL/USD': ['USD'], 'BNB/USD': ['USD'],
}

export function getRelevantCurrencies(symbol: string): string[] {
  if (SYMBOL_CURRENCIES[symbol]) return SYMBOL_CURRENCIES[symbol]
  // For unknown pairs with a slash (e.g. AUD/CAD), parse the currencies
  if (symbol.includes('/')) return symbol.split('/').map(s => s.trim().toUpperCase())
  // For stocks/indices, use USD (CPI, NFP, FOMC all move US markets)
  return ['USD']
}

/** Country / currency field from calendar APIs → does this release matter for the symbol? */
const REGION_TO_CCYS: Record<string, string[]> = {
  'UNITED STATES': ['USD'], USA: ['USD'], US: ['USD'], AMERICA: ['USD'],
  'UNITED KINGDOM': ['GBP'], UK: ['GBP'], BRITAIN: ['GBP'], 'GREAT BRITAIN': ['GBP'],
  'EURO AREA': ['EUR'], EUROZONE: ['EUR'], EMU: ['EUR'], EU: ['EUR'],
  GERMANY: ['EUR'], FRANCE: ['EUR'], ITALY: ['EUR'], SPAIN: ['EUR'], NETHERLANDS: ['EUR'],
  AUSTRIA: ['EUR'], BELGIUM: ['EUR'], IRELAND: ['EUR'], PORTUGAL: ['EUR'], FINLAND: ['EUR'],
  GREECE: ['EUR'], 'NEW ZEALAND': ['NZD'], 'SOUTH KOREA': ['KRW'], KOREA: ['KRW'],
  SWITZERLAND: ['CHF'], SWEDEN: ['SEK'], NORWAY: ['NOK'], DENMARK: ['DKK'],
  CHINA: ['CNY'], INDIA: ['INR'], BRAZIL: ['BRL'], MEXICO: ['MXN'], RUSSIA: ['RUB'],
  TURKEY: ['TRY'], SINGAPORE: ['SGD'], 'HONG KONG': ['HKD'], TAIWAN: ['TWD'],
  AUSTRALIA: ['AUD'], CANADA: ['CAD'], JAPAN: ['JPY'], 'UNITED ARAB EMIRATES': ['AED'],
}

export function eventRelevantToSymbol(event: CalendarEvent, symbol: string): boolean {
  const ccys = getRelevantCurrencies(symbol)
  const raw = event.country.toUpperCase().trim()

  if (ccys.some((c) => raw === c)) return true

  const expanded = REGION_TO_CCYS[raw]
  if (expanded?.some((c) => ccys.includes(c))) return true

  if (event.impact === 'Holiday') {
    if (ccys.some((c) => raw.includes(c))) return true
    if (!raw && ccys.includes('USD')) return true
    return false
  }

  return false
}

/** Dashboard sidebar: upcoming macro relevant to the chart symbol (next ~72h). */
export function filterDashboardCalendarEvents(
  events: CalendarEvent[],
  symbol: string,
  nowMs: number = Date.now(),
  horizonHours = 72,
): CalendarEvent[] {
  const horizon = nowMs + horizonHours * 3_600_000
  const pastCut = nowMs - 2 * 3_600_000

  return events
    .filter((e) => {
      if (e.timestamp > horizon) return false
      if (e.timestamp < pastCut) return false
      if (e.impact === 'Holiday') return eventRelevantToSymbol(e, symbol)
      if (e.impact !== 'High' && e.impact !== 'Medium') return false
      return eventRelevantToSymbol(e, symbol)
    })
    .sort((a, b) => a.timestamp - b.timestamp)
}

interface NewsResult {
  score: number
  minutesToNext: number
  nextEvent: CalendarEvent | null
  isHoliday: boolean
}

function computeNewsScore(events: CalendarEvent[], symbol: string, nowMs: number): NewsResult {
  // Bank holidays today that affect this symbol's economies
  const dayStart = nowMs - (nowMs % 86_400_000)  // midnight UTC
  const dayEnd   = dayStart + 86_400_000
  const holiday  = events.find(
    (e) =>
      e.impact === 'Holiday' &&
      e.timestamp >= dayStart &&
      e.timestamp < dayEnd &&
      eventRelevantToSymbol(e, symbol),
  )
  if (holiday) {
    return { score: 5, minutesToNext: 0, nextEvent: holiday, isHoliday: true }
  }

  // Weighted upcoming events: High = full weight, Medium = 60%
  type Candidate = { event: CalendarEvent; minutesAway: number; weight: number }
  const candidates: Candidate[] = events
    .filter(
      (e) =>
        e.impact === 'High' && eventRelevantToSymbol(e, symbol),
    )
    .map((e) => ({
      event:       e,
      minutesAway: (e.timestamp - nowMs) / 60_000,
      weight:      e.impact === 'High' ? 1.0 : 0.6,
    }))
    .filter((c) => c.minutesAway >= -45) // include releases up to 45m ago (volatility window)
    .sort((a, b) => Math.abs(a.minutesAway) - Math.abs(b.minutesAway))

  if (candidates.length === 0) return { score: 100, minutesToNext: 999, nextEvent: null, isHoliday: false }

  const { event, minutesAway, weight } = candidates[0]
  const effectiveMinutes = Math.max(0, minutesAway)
  // High-impact: steeper curve so proximity hurts more; medium stays softer
  const proximityK = event.impact === 'High' ? 2.85 : 2.0
  return {
    score:         clamp(Math.round(effectiveMinutes * proximityK * weight), 0, 100),
    minutesToNext: effectiveMinutes,
    nextEvent:     event,
    isHoliday:     false,
  }
}

interface DirectionalSignal {
  direction: 'up' | 'down' | 'flat'
  confidence: number
  directionalScore: number
  structureScore: number
  timingScore: number
}

function computeDirectionalSignal(
  candles: Candle[],
  trendDirection: 'up' | 'down' | 'flat',
  trendQuality: number,
  rsi: number | null,
  ema20: number | null,
  currentPrice: number | null,
  support: number | null,
  resistance: number | null,
  atr: number | null,
  newsScore: number,
): DirectionalSignal {
  if (candles.length < 5 || currentPrice === null) {
    return { direction: 'flat', confidence: 50, directionalScore: 50, structureScore: 50, timingScore: 50 }
  }

  const recent = candles.slice(-Math.min(20, candles.length))
  const first = recent[0]
  const last = recent[recent.length - 1]
  const atrPct = atr && currentPrice > 0 ? atr / currentPrice : 0.0025
  const netMove = currentPrice - first.close
  const netMoveUnits = atrPct > 0 ? netMove / (currentPrice * atrPct) : 0
  const emaUnits = ema20 !== null && currentPrice > 0 && atrPct > 0
    ? (currentPrice - ema20) / (currentPrice * atrPct)
    : 0

  let signedEvidence = 0
  signedEvidence += clamp(netMoveUnits * 18, -28, 28)
  signedEvidence += clamp(emaUnits * 13, -24, 24)
  signedEvidence += trendDirection === 'up' ? 18 : trendDirection === 'down' ? -18 : 0

  const bodyFlow = recent.reduce((sum, c) => {
    const range = c.high - c.low
    if (range <= 0) return sum
    return sum + ((c.close - c.open) / range)
  }, 0) / recent.length
  signedEvidence += clamp(bodyFlow * 22, -18, 18)

  if (rsi !== null) {
    if (rsi >= 52 && rsi <= 72) signedEvidence += 9
    else if (rsi <= 48 && rsi >= 28) signedEvidence -= 9
    else if (rsi > 78) signedEvidence -= 5
    else if (rsi < 22) signedEvidence += 5
  }

  if (support !== null && resistance !== null && resistance > support) {
    const equilibrium = (support + resistance) / 2
    const range = resistance - support
    const distanceFromEq = (currentPrice - equilibrium) / range
    signedEvidence += clamp(distanceFromEq * 18, -9, 9)
  }

  const direction = signedEvidence > 4 ? 'up' : signedEvidence < -4 ? 'down' : (last.close >= first.close ? 'up' : 'down')
  const directionalScore = clamp(Math.round(50 + Math.abs(signedEvidence)), 0, 100)
  const structureScore = clamp(Math.round(trendQuality * 0.85 + directionalScore * 0.15), 0, 100)
  const timingScore = clamp(Math.round(newsScore * 0.35 + structureScore * 0.35 + directionalScore * 0.30), 0, 100)
  const confidence = clamp(Math.round(directionalScore * 0.30 + structureScore * 0.55 + timingScore * 0.15), 0, 100)

  return { direction, confidence, directionalScore, structureScore, timingScore }
}

// ── Technical indicators (exported for charting) ──────────────────────────────

export function computeRSISeries(candles: Candle[], period = 14): (number | null)[] {
  const result: (number | null)[] = Array(candles.length).fill(null)
  if (candles.length < period + 1) return result

  let avgGain = 0, avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const d = candles[i].close - candles[i - 1].close
    if (d > 0) avgGain += d; else avgLoss -= d
  }
  avgGain /= period; avgLoss /= period
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)

  for (let i = period + 1; i < candles.length; i++) {
    const d = candles[i].close - candles[i - 1].close
    avgGain = (avgGain * (period - 1) + Math.max(0, d)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return result
}

export function computeEMASeries(candles: Candle[], period: number): (number | null)[] {
  const result: (number | null)[] = Array(candles.length).fill(null)
  if (candles.length < period) return result
  const k = 2 / (period + 1)
  let ema = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period
  result[period - 1] = ema
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k)
    result[i] = ema
  }
  return result
}

function computeRSI(candles: Candle[], period = 14): number | null {
  const series = computeRSISeries(candles, period)
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i] !== null) return Math.round(series[i]! * 10) / 10
  }
  return null
}

function computeEMA(candles: Candle[], period: number): number | null {
  const series = computeEMASeries(candles, period)
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i] !== null) return series[i]!
  }
  return null
}

export function computeATR(candles: Candle[], period = 14): number | null {
  if (candles.length < 2) return null
  const trs = candles.slice(1).map((c, i) =>
    Math.max(c.high - c.low, Math.abs(c.high - candles[i].close), Math.abs(c.low - candles[i].close))
  )
  const window = trs.slice(-period)
  return window.reduce((s, v) => s + v, 0) / window.length
}

export function computeSwingLevels(candles: Candle[]): { support: number | null; resistance: number | null } {
  if (candles.length < 5) return { support: null, resistance: null }
  const recent = candles.slice(-Math.min(30, candles.length))
  let support = Infinity, resistance = -Infinity
  for (let i = 2; i < recent.length - 2; i++) {
    if (recent[i].low  < recent[i-1].low  && recent[i].low  < recent[i-2].low  &&
        recent[i].low  < recent[i+1].low  && recent[i].low  < recent[i+2].low)
      support = Math.min(support, recent[i].low)
    if (recent[i].high > recent[i-1].high && recent[i].high > recent[i-2].high &&
        recent[i].high > recent[i+1].high && recent[i].high > recent[i+2].high)
      resistance = Math.max(resistance, recent[i].high)
  }
  return {
    support:    support    === Infinity  ? null : support,
    resistance: resistance === -Infinity ? null : resistance,
  }
}

type SwingPoint = { index: number; price: number; kind: 'high' | 'low' }

interface SmartMoneyContext {
  swings: SwingPoint[]
  structure: string
  dealingRange: { high: number | null; low: number | null; equilibrium: number | null }
  premiumDiscount: 'premium' | 'discount' | 'equilibrium' | 'unknown'
  liquidity: string[]
  displacement: string
  fairValueGaps: string[]
  orderBlock: string | null
  smt: string
}

function formatPrice(value: number | null, info?: PairInfo): string {
  if (value === null) return 'unknown'
  if (info?.isCrypto) return `$${value.toFixed(2)}`
  if (info?.pipFactor === 100) return value.toFixed(3)
  return value < 10 ? value.toFixed(3) : value.toFixed(5)
}

function computeSmartMoneyContext(candles: Candle[], info?: PairInfo): SmartMoneyContext {
  const recent = candles.slice(-Math.min(80, candles.length))
  const swings: SwingPoint[] = []

  for (let i = 2; i < recent.length - 2; i++) {
    const c = recent[i]
    if (c.high > recent[i - 1].high && c.high > recent[i - 2].high && c.high > recent[i + 1].high && c.high > recent[i + 2].high) {
      swings.push({ index: i, price: c.high, kind: 'high' })
    }
    if (c.low < recent[i - 1].low && c.low < recent[i - 2].low && c.low < recent[i + 1].low && c.low < recent[i + 2].low) {
      swings.push({ index: i, price: c.low, kind: 'low' })
    }
  }

  const swingHighs = swings.filter(s => s.kind === 'high')
  const swingLows  = swings.filter(s => s.kind === 'low')
  const lastHigh = swingHighs[swingHighs.length - 1] ?? null
  const prevHigh = swingHighs[swingHighs.length - 2] ?? null
  const lastLow  = swingLows[swingLows.length - 1] ?? null
  const prevLow  = swingLows[swingLows.length - 2] ?? null
  const last = recent[recent.length - 1] ?? null

  let structure = 'Structure is still developing; there are not enough confirmed swing points for a clean ICT/ICC read.'
  if (last && lastHigh && lastLow) {
    const brokeHigh = prevHigh !== null && last.close > prevHigh.price
    const brokeLow  = prevLow !== null && last.close < prevLow.price
    const higherLow = prevLow !== null && lastLow.price > prevLow.price
    const lowerHigh = prevHigh !== null && lastHigh.price < prevHigh.price

    if (brokeHigh && higherLow) {
      structure = `Bullish market structure is active: price has accepted above the prior swing high near ${formatPrice(prevHigh.price, info)} while holding a higher low at ${formatPrice(lastLow.price, info)}. That reads as bullish BOS rather than a random push.`
    } else if (brokeLow && lowerHigh) {
      structure = `Bearish market structure is active: price has accepted below the prior swing low near ${formatPrice(prevLow.price, info)} while forming a lower high at ${formatPrice(lastHigh.price, info)}. That reads as bearish BOS with sellers controlling delivery.`
    } else if (brokeHigh) {
      structure = `Price has broken above the prior swing high near ${formatPrice(prevHigh.price, info)}, but the higher-low sequence is not fully confirmed. Treat it as potential bullish displacement until the next pullback validates the structure.`
    } else if (brokeLow) {
      structure = `Price has broken below the prior swing low near ${formatPrice(prevLow.price, info)}, but the lower-high sequence is not fully confirmed. Treat it as potential bearish displacement until the next retracement confirms.`
    } else {
      structure = `Price remains inside the latest dealing range between ${formatPrice(lastLow.price, info)} and ${formatPrice(lastHigh.price, info)}. No clean BOS is confirmed yet, so the current tape is better read as range delivery until one side is displaced and accepted.`
    }
  }

  const high = lastHigh?.price ?? (recent.length ? Math.max(...recent.map(c => c.high)) : null)
  const low  = lastLow?.price  ?? (recent.length ? Math.min(...recent.map(c => c.low)) : null)
  const equilibrium = high !== null && low !== null ? (high + low) / 2 : null
  let premiumDiscount: SmartMoneyContext['premiumDiscount'] = 'unknown'
  if (last && high !== null && low !== null && equilibrium !== null) {
    const band = (high - low) * 0.08
    premiumDiscount = last.close > equilibrium + band ? 'premium' : last.close < equilibrium - band ? 'discount' : 'equilibrium'
  }

  const liquidity: string[] = []
  if (last && prevHigh && last.high > prevHigh.price && last.close < prevHigh.price) {
    liquidity.push(`Buy-side liquidity was swept above ${formatPrice(prevHigh.price, info)} and price closed back underneath it, which is a classic stop-run signature.`)
  }
  if (last && prevLow && last.low < prevLow.price && last.close > prevLow.price) {
    liquidity.push(`Sell-side liquidity was swept below ${formatPrice(prevLow.price, info)} and price closed back above it, suggesting downside stops were raided before repricing.`)
  }
  if (liquidity.length === 0 && lastHigh && lastLow) {
    liquidity.push(`Nearest obvious liquidity pools sit above ${formatPrice(lastHigh.price, info)} and below ${formatPrice(lastLow.price, info)}. Until one pool is raided, avoid assuming the next move is clean continuation.`)
  }
  if (liquidity.length === 0 && high !== null && low !== null) {
    liquidity.push(`Confirmed swing liquidity is limited, so use the recent high at ${formatPrice(high, info)} and recent low at ${formatPrice(low, info)} as provisional buy-side and sell-side pools.`)
  }
  if (liquidity.length === 0) {
    liquidity.push('Liquidity cannot be mapped cleanly yet because candle history is too thin.')
  }

  const ranges = recent.map(c => c.high - c.low)
  const avgRange = ranges.slice(0, -1).reduce((s, v) => s + v, 0) / Math.max(ranges.length - 1, 1)
  const lastRange = last ? last.high - last.low : 0
  const lastBody = last ? Math.abs(last.close - last.open) : 0
  const bodyRatio = lastRange > 0 ? lastBody / lastRange : 0
  const displacement = last && avgRange > 0 && lastRange > avgRange * 1.5 && bodyRatio > 0.55
    ? `The latest candle shows displacement: range is ${(lastRange / avgRange).toFixed(1)}x the recent average and the body controls ${Math.round(bodyRatio * 100)}% of the candle. That is institutional-style delivery, not passive drift.`
    : 'No strong displacement candle is present on the latest bar. That means entries need extra confirmation from a sweep, FVG tap, or break-and-retest rather than chasing mid-range.'

  const fairValueGaps: string[] = []
  for (let i = Math.max(2, recent.length - 18); i < recent.length; i++) {
    const left = recent[i - 2]
    const right = recent[i]
    if (left.high < right.low) fairValueGaps.push(`Bullish FVG from ${formatPrice(left.high, info)} to ${formatPrice(right.low, info)}`)
    if (left.low > right.high) fairValueGaps.push(`Bearish FVG from ${formatPrice(right.high, info)} to ${formatPrice(left.low, info)}`)
  }

  let orderBlock: string | null = null
  for (let i = recent.length - 2; i >= 1; i--) {
    const next = recent[i + 1]
    const c = recent[i]
    const nextRange = next.high - next.low
    if (avgRange > 0 && nextRange > avgRange * 1.35) {
      if (next.close > next.open && c.close < c.open) {
        orderBlock = `Potential bullish order block: last down-close candle before displacement, spanning ${formatPrice(c.low, info)} to ${formatPrice(c.high, info)}. A controlled return into that zone can act as a refinement area.`
        break
      }
      if (next.close < next.open && c.close > c.open) {
        orderBlock = `Potential bearish order block: last up-close candle before displacement, spanning ${formatPrice(c.low, info)} to ${formatPrice(c.high, info)}. A controlled return into that zone can act as a refinement area.`
        break
      }
    }
  }

  const smt = info?.isCrypto
    ? 'SMT should be confirmed against BTC/ETH leadership: if this chart raids a high while the leader fails to confirm, treat longs as suspect; if it raids a low while the leader holds, watch for reversal delivery.'
    : 'SMT should be confirmed against the correlated pair or dollar index: for USD pairs, compare this swing raid against DXY or the sister major. A higher high here without confirmation there is bearish SMT; a lower low here without confirmation there is bullish SMT.'

  return {
    swings,
    structure,
    dealingRange: { high, low, equilibrium },
    premiumDiscount,
    liquidity,
    displacement,
    fairValueGaps: fairValueGaps.slice(-4),
    orderBlock,
    smt,
  }
}

// ── Pair intelligence ─────────────────────────────────────────────────────────

interface PairInfo {
  catalyst: string
  session: string
  character: string
  pipFactor: number
  isCrypto: boolean
}

const PAIR_INFO: Record<string, PairInfo> = {
  'EUR/USD': {
    catalyst:  'ECB/Fed policy divergence, Eurozone PMI, US CPI and NFP',
    session:   'London/NY overlap (13:00–17:00 UTC)',
    character: 'The most liquid forex pair globally. Tight spreads and strong technical respect. Major moves follow ECB or Fed surprises.',
    pipFactor: 10000, isCrypto: false,
  },
  'GBP/USD': {
    catalyst:  'BoE policy, UK CPI and GDP, US data releases',
    session:   'London open (08:00 UTC) through NY close',
    character: 'Cable is more volatile than EUR/USD. Prone to sharp overruns on UK data. Liquidity thins notably at 20:00 UTC.',
    pipFactor: 10000, isCrypto: false,
  },
  'USD/JPY': {
    catalyst:  'BoJ policy, US Treasury yields, risk-off flows, Fed guidance',
    session:   'Tokyo open (00:00 UTC) and NY overlap',
    character: 'Tracks US 10-year yields very closely. BoJ intervention risk becomes elevated above historical extremes. Safe-haven during equity stress.',
    pipFactor: 100, isCrypto: false,
  },
  'AUD/USD': {
    catalyst:  'RBA policy, Chinese economic data, iron ore prices, global risk appetite',
    session:   'Sydney/Tokyo session (21:00–06:00 UTC)',
    character: 'Commodity-linked and China-sensitive. Thin liquidity in the US session amplifies moves. Trades as a risk barometer.',
    pipFactor: 10000, isCrypto: false,
  },
  'USD/CAD': {
    catalyst:  'BoC policy, WTI crude oil, US trade data, CAD employment',
    session:   'New York session (13:00–21:00 UTC)',
    character: 'Inversely correlated with crude oil. Moves in lockstep with WTI intraday. NFP-aligned releases hit CAD hard.',
    pipFactor: 10000, isCrypto: false,
  },
  'USD/CHF': {
    catalyst:  'SNB policy, geopolitical risk, Eurozone stress, US data',
    session:   'European session (07:00–16:00 UTC)',
    character: 'CHF is a safe-haven currency. Flows to CHF during risk-off events. SNB has a history of sudden intervention.',
    pipFactor: 10000, isCrypto: false,
  },
  'NZD/USD': {
    catalyst:  'RBNZ policy, dairy prices, Chinese data, global risk tone',
    session:   'Wellington/Sydney open (21:00–04:00 UTC)',
    character: 'Thinner liquidity than AUD/USD. Higher spreads. Highly sensitive to global risk sentiment and commodity cycles.',
    pipFactor: 10000, isCrypto: false,
  },
  'BTC/USD': {
    catalyst:  'ETF fund flows, on-chain activity, macro risk sentiment, regulatory news',
    session:   '24/7 — highest volume during NY/London overlap',
    character: 'High volatility digital asset. Strong weekend gap effect. Reacts sharply to macro risk-on/off and regulatory headlines.',
    pipFactor: 1, isCrypto: true,
  },
  'ETH/USD': {
    catalyst:  'Protocol upgrades, DeFi/NFT activity, BTC correlation, ETF flows',
    session:   '24/7 — highest volume during NY/London overlap',
    character: 'Higher beta than BTC. Gas fee spikes signal network congestion which can precede volatility. Follows BTC with a lag.',
    pipFactor: 1, isCrypto: true,
  },
}

// ── Deep analysis for report panel ───────────────────────────────────────────

interface DeepAnalysisParams {
  symbol: string
  interval: string
  trendScore: number
  volatilityScore: number
  direction: 'up' | 'down' | 'flat'
  rsi: number | null
  ema20: number | null
  currentPrice: number | null
  support: number | null
  resistance: number | null
  atr: number | null
  minutesToNext: number
  nextEvent: CalendarEvent | null
  recentEvents: CalendarEvent[]
  candles: Candle[]
}

function buildDeepAnalysis(p: DeepAnalysisParams): string[] {
  const info = PAIR_INFO[p.symbol]
  const sections: string[] = []
  const smartMoney = computeSmartMoneyContext(p.candles, info)
  const section = (title: string, body: string) => sections.push(`${title}::${body}`)

  // Seeded variety — changes each report as new candles arrive
  const seed = Math.abs(Math.round((p.currentPrice ?? 1) * 1000 + (p.atr ?? 0) * 100000 + p.candles.length * 37))
  const pick = <T>(arr: T[]): T => arr[seed % arr.length]
  const pick2 = <T>(arr: T[]): T => arr[(seed * 31) % arr.length]

  const pf   = info?.pipFactor ?? 10000
  const prec = (v: number) => v < 10 ? 2 : info?.pipFactor === 100 ? 3 : 5

  // ── Momentum (replaces Bias — no direction label here, that stays on dashboard) ──
  const rsiZone = p.rsi === null ? null
    : p.rsi > 75 ? 'deep overbought'
    : p.rsi > 68 ? 'approaching overbought'
    : p.rsi > 55 ? 'bullish mid-range'
    : p.rsi > 45 ? 'neutral territory'
    : p.rsi > 32 ? 'bearish mid-range'
    : p.rsi > 25 ? 'approaching oversold'
    : 'deep oversold'

  const emaDistPips = (p.ema20 !== null && p.currentPrice !== null)
    ? Math.abs(p.currentPrice - p.ema20) * pf
    : null
  const emaSide = (p.ema20 !== null && p.currentPrice !== null)
    ? p.currentPrice > p.ema20 ? 'above' : 'below'
    : null

  const momentumIntros = [
    `Reading ${p.candles.length} candles on the ${p.interval} timeframe.`,
    `Analysis built from ${p.candles.length} ${p.interval} bars.`,
    `${p.candles.length} candles sampled at the ${p.interval} resolution.`,
    `Computed across ${p.candles.length} ${p.interval} candles.`,
  ]
  const rsiLine = p.rsi !== null
    ? `RSI 14 sits at ${p.rsi} — ${rsiZone}${p.rsi > 70 ? ', momentum is stretched and mean-reversion risk rises' : p.rsi < 30 ? ', exhaustion possible but confirmation needed before counter-trend entries' : ', within normal operating range'}.`
    : 'RSI unavailable for this dataset.'
  const emaLine = emaDistPips !== null && emaSide !== null
    ? `Price is ${emaSide} the 20-period EMA by ${emaDistPips.toFixed(1)} ${info?.isCrypto ? 'dollars' : 'pips'}, ${emaDistPips > (p.atr ?? 0) * pf * 0.8 ? 'a meaningful stretch that increases pullback probability' : 'a contained distance consistent with an active trend'}.`
    : 'EMA 20 is not yet computable from the available history.'
  section('Momentum', `${pick(momentumIntros)} ${rsiLine} ${emaLine}`)

  // ── Levels ──
  const levelParts: string[] = []
  if (p.support !== null && p.resistance !== null) {
    const rangePips  = (p.resistance - p.support) * pf
    const distToSup  = p.currentPrice !== null ? (p.currentPrice - p.support) * pf : null
    const distToRes  = p.currentPrice !== null ? (p.resistance - p.currentPrice) * pf : null
    const supStr     = p.support.toFixed(prec(p.support))
    const resStr     = p.resistance.toFixed(prec(p.resistance))
    const rangeDesc  = pick2(['spanning', 'covering', 'defining a range of', 'across'])
    levelParts.push(`Swing demand at ${supStr} and supply at ${resStr} — ${rangeDesc} ${rangePips.toFixed(1)} ${info?.isCrypto ? 'dollars' : 'pips'}.`)
    if (distToSup !== null && distToRes !== null) {
      const closer = distToSup < distToRes ? `closer to support (${distToSup.toFixed(1)} ${info?.isCrypto ? '$' : 'pips'} away)` : `closer to resistance (${distToRes.toFixed(1)} ${info?.isCrypto ? '$' : 'pips'} away)`
      levelParts.push(`Price is currently ${closer}.`)
    }
  } else if (p.support !== null) {
    const distToSup = p.currentPrice !== null ? (p.currentPrice - p.support) * pf : null
    levelParts.push(`Demand floor at ${p.support.toFixed(prec(p.support))}${distToSup !== null ? ` — ${distToSup.toFixed(1)} ${info?.isCrypto ? '$' : 'pips'} below current price` : ''}.`)
  } else if (p.resistance !== null) {
    const distToRes = p.currentPrice !== null ? (p.resistance - p.currentPrice) * pf : null
    levelParts.push(`Supply ceiling at ${p.resistance.toFixed(prec(p.resistance))}${distToRes !== null ? ` — ${distToRes.toFixed(1)} ${info?.isCrypto ? '$' : 'pips'} above current price` : ''}.`)
  } else {
    levelParts.push('No clean swing levels identified in recent candles; use the chart extremes as provisional reference.')
  }

  const structurePhrases = p.trendScore >= 70
    ? p.direction === 'up'
      ? pick(['Sequence of higher highs and higher lows is intact — bulls are defending each pullback.', 'Price is printing consistent HH/HL structure, indicating buyers are absorbing every dip.', 'Bullish structure is clean: each swing low is higher than the last, confirming active demand.'])
      : p.direction === 'down'
      ? pick(['Sequence of lower highs and lower lows in place — sellers are capping each recovery.', 'Bearish HH/LH structure confirmed; distribution is outpacing accumulation on this timeframe.', 'Lower highs and lower lows define the current structure — continuation favors the sellers until a BOS forms.'])
      : pick(['Trend structure is clean but direction is flat; price is consolidating after a directional run.', 'Structure quality is high but neither side has broken out — range delivery mode.'])
    : p.trendScore >= 40
      ? pick(['Structure is mixed; there is directional lean but the sequence of highs and lows is not clean enough for high-confidence continuation.', 'Swing points are developing but no confirmed HH/HL or LL/LH sequence is in place — patience before committing.', 'Price action is partially directional; the trend score of ' + p.trendScore + '/100 reflects a setup that needs one more clean leg to confirm.'])
      : pick(['Structure is choppy — frequent reversals (trend quality ' + p.trendScore + '/100) suggest range-bound or news-driven tape.', 'Low-quality structure: candles are reversing often, reducing the probability of clean continuation moves.', 'The sequence is breaking down frequently; treat this as a ranging environment until a clear displacement separates buyers from sellers.'])
  levelParts.push(structurePhrases)
  section('Levels', levelParts.join(' '))

  // ── ICT/ICC ──
  const range = smartMoney.dealingRange
  const pdPhrase = smartMoney.premiumDiscount === 'unknown'
    ? pick(['The dealing range is still forming — premium/discount cannot be reliably calculated.', 'Insufficient swing structure to define a clean dealing range premium or discount zone.'])
    : smartMoney.premiumDiscount === 'premium'
      ? pick([
          `Price is currently trading in premium (above equilibrium at ${formatPrice(range.equilibrium, info)}) — longs from here carry a higher fade risk and need extra confirmation.`,
          `Current price sits above the dealing range midpoint (${formatPrice(range.equilibrium, info)}), placing it in premium. Ideal long entries are typically built from discount; this location suits short refinements.`,
        ])
      : smartMoney.premiumDiscount === 'discount'
        ? pick([
            `Price is trading in discount (below equilibrium at ${formatPrice(range.equilibrium, info)}) — this is the preferred zone for building long positions with defined risk.`,
            `Current price is below the dealing range midpoint (${formatPrice(range.equilibrium, info)}), sitting in discount. Institutional longs tend to originate from this zone.`,
          ])
        : pick([
            `Price is near equilibrium (${formatPrice(range.equilibrium, info)}) — neither premium nor discount, which increases two-way risk and reduces entry clarity.`,
            `At equilibrium (${formatPrice(range.equilibrium, info)}), price is in the least predictable part of the range. Wait for a push into discount or premium before framing an entry.`,
          ])
  section('ICT/ICC', `${smartMoney.structure} ${pdPhrase}`)

  // ── Liquidity ──
  section('Liquidity', smartMoney.liquidity.join(' '))

  // ── Imbalance ──
  const fvgText = smartMoney.fairValueGaps.length > 0
    ? pick([
        `Active imbalances: ${smartMoney.fairValueGaps.join('; ')}. These gaps represent unfilled institutional orders and are valid draw targets.`,
        `Fair value gaps present — ${smartMoney.fairValueGaps.join('; ')}. Price has a statistical tendency to return and fill these before continuing.`,
      ])
    : pick([
        'No clean FVGs in recent candles — the market has been delivering in a balanced way without leaving significant imbalances.',
        'FVG scan came up empty for this window. Entries relying on imbalance taps need to look at a lower timeframe for refinement.',
      ])
  const obText = smartMoney.orderBlock
    ? smartMoney.orderBlock
    : pick([
        'No high-probability order block identified in the current lookback window.',
        'Order block detection found no qualifying candle — displacement was either absent or the preceding candle structure did not qualify.',
      ])
  section('Imbalance', `${smartMoney.displacement} ${fvgText} ${obText}`)

  // ── Volatility ──
  const atrDisplay = p.atr !== null
    ? info?.isCrypto
      ? `$${p.atr.toFixed(2)}`
      : `${(p.atr * pf).toFixed(1)} pips`
    : null
  const stopSuggestion = p.atr !== null && p.currentPrice !== null
    ? info?.isCrypto
      ? `A 1× ATR invalidation sits ${(p.atr).toFixed(2)} dollars from entry; 1.5× gives ${(p.atr * 1.5).toFixed(2)} dollars of breathing room.`
      : `A 1× ATR stop sits ${(p.atr * pf).toFixed(1)} pips from entry; 1.5× gives ${(p.atr * pf * 1.5).toFixed(1)} pips of breathing room.`
    : ''

  const volQuality = p.volatilityScore >= 70
    ? pick([
        'Range distribution is controlled — candles are consistent in size, which improves stop placement precision.',
        'Volatility is well-contained relative to recent history, creating a cleaner risk/reward calculation.',
        `Ranges are orderly (volatility score ${p.volatilityScore}/100); this is an environment where measured entries work well.`,
      ])
    : p.volatilityScore >= 40
      ? pick([
          'Range expansion is visible — recent candles are running larger than the baseline. Use wider invalidation levels.',
          `Volatility is elevated (score ${p.volatilityScore}/100). Consider reducing position size or waiting for ranges to compress before entry.`,
          'Ranges are inconsistent; stops placed at a 1× ATR level carry a meaningful chance of being tagged by normal market noise.',
        ])
      : pick([
          'Volatility is expanded significantly — spike candles or news activity may be driving oversized moves. Tight stops will be consistently clipped.',
          `Volatility score of ${p.volatilityScore}/100 indicates a high-noise environment. This is not the setup to size up; prioritise capital preservation.`,
          'Ranges are running hot — average candle size is well above baseline. Either sit out or use very wide invalidation only on high-conviction entries.',
        ])

  section('Volatility', [atrDisplay ? `ATR: ${atrDisplay}. ${stopSuggestion}` : '', volQuality].filter(Boolean).join(' '))

  // ── SMT ──
  section('SMT', `${smartMoney.smt} Treat this as a confirmation step because only the active chart is loaded here.`)

  // ── Execution ──
  const planIntros = pick([
    'Execution checklist:',
    'Setup framework:',
    'Entry conditions to watch for:',
    'Before committing to a position:',
  ])
  const supStr2  = p.support   !== null ? p.support.toFixed(prec(p.support))     : null
  const resStr2  = p.resistance !== null ? p.resistance.toFixed(prec(p.resistance)) : null

  let executionText: string
  if (p.direction === 'up') {
    const sweepTarget = supStr2 ? ` below ${supStr2}` : ' below the recent swing low'
    const retrace = smartMoney.premiumDiscount === 'premium' ? 'a pullback into discount or FVG' : 'any FVG or order block in the current zone'
    executionText = pick([
      `${planIntros} Wait for a sell-side liquidity sweep${sweepTarget}, then watch for bullish displacement and a close back above the swept level. Enter on ${retrace}. Invalidate on a candle close back through the raid low.`,
      `${planIntros} Let price raid stops${sweepTarget} first. Once swept, look for a momentum shift candle and enter on the first pullback into any open FVG or demand zone. Do not chase the displacement candle itself.`,
      `${planIntros} Seek a liquidity grab${sweepTarget} followed by a break of structure to the upside. Enter at ${retrace} with invalidation below the sweep low. Hold until the next liquidity pool above is tagged.`,
    ])
  } else if (p.direction === 'down') {
    const sweepTarget = resStr2 ? ` above ${resStr2}` : ' above the recent swing high'
    const retrace = smartMoney.premiumDiscount === 'discount' ? 'a retrace into premium or FVG' : 'any FVG or order block in the current zone'
    executionText = pick([
      `${planIntros} Wait for a buy-side liquidity sweep${sweepTarget}, then watch for bearish displacement and a close back below the swept level. Enter on ${retrace}. Invalidate on a close back through the raid high.`,
      `${planIntros} Let price grab stops${sweepTarget} first. Once swept, look for a momentum shift and enter on the first pull into a bearish FVG or supply zone. Avoid entering at premium without the sweep first.`,
      `${planIntros} Seek a liquidity grab${sweepTarget} and a structure break to the downside. Refine the entry using the closest FVG or order block with invalidation above the sweep high.`,
    ])
  } else {
    executionText = pick([
      `${planIntros} No directional edge is present. Wait for one side of the range to be swept cleanly — then confirm displacement and structure shift before choosing a direction. Do not front-run the break.`,
      `${planIntros} The tape is balanced. Mark the range highs and lows as potential liquidity targets. Whichever side gets swept first and shows displacement and a BOS is the trade — but require all three before entering.`,
      `${planIntros} With no clear bias, the play is reactive. Wait for a clean raid of either the upper or lower liquidity pool, then demand a candle close confirming the reversal before risking capital.`,
    ])
  }
  section('Execution', executionText)

  // ── Macro ──
  const macroIntros = pick([
    'Macro context:',
    'Event landscape:',
    'News environment:',
    'Calendar snapshot:',
  ])
  const newsParts: string[] = [macroIntros]
  if (p.recentEvents.length > 0) {
    const names = p.recentEvents.map(e => e.title).slice(0, 2).join(' and ')
    newsParts.push(pick([
      `${names} released recently — price may still be digesting the move.`,
      `Recent catalysts include ${names}. Post-release volatility can linger; check whether the reaction has completed or is still unfolding.`,
    ]))
  }
  if (p.nextEvent && p.minutesToNext < 15) {
    newsParts.push(`${p.nextEvent.title} is imminent — do not enter a new position. Wait for the release and the initial reaction candle to close before assessing the follow-through.`)
  } else if (p.nextEvent && p.minutesToNext < 60) {
    newsParts.push(`${p.nextEvent.title} is ${formatMinutes(p.minutesToNext)} away. ${pick(['Reduce size or stand aside until the event passes.', 'Consider halving exposure or waiting for the post-release structure to develop.', 'A high-impact release this close warrants waiting for the reaction before committing.'])}`)
  } else if (p.nextEvent && p.minutesToNext < 240) {
    newsParts.push(`${p.nextEvent.title} in ${formatMinutes(p.minutesToNext)} — enough time for one swing but reassess positioning before the release window.`)
  } else if (p.nextEvent) {
    newsParts.push(`Next scheduled event is ${p.nextEvent.title} in ${formatMinutes(p.minutesToNext)} — well clear for now, but keep it on the radar.`)
  } else {
    newsParts.push(pick([
      'No high-impact events on the immediate horizon — the tape is free from scheduled macro risk for now.',
      'Calendar is clear of high-impact releases; price action should reflect pure technical delivery without sudden news distortion.',
      'No nearby macro catalysts. This favours technically-driven setups over reactive news plays.',
    ]))
  }
  section('Macro', newsParts.join(' '))

  return sections
}

// ── Score → label ─────────────────────────────────────────────────────────────
function toLabel(score: number, direction: 'up' | 'down' | 'flat'): string {
  const side = direction === 'up' ? 'Long' : direction === 'down' ? 'Short' : 'No Bias'
  if (direction === 'flat') return 'No Clear Bias'
  if (score >= 80) return `High-Confidence ${side}`
  if (score >= 65) return `Strong ${side}`
  if (score >= 45) return `Developing ${side}`
  return `Low-Confidence ${side}`
}

// ── Short analysis (ConfidenceMeter sidebar) ───────────────────────────────────
function buildAnalysis(
  symbol: string,
  direction: 'up' | 'down' | 'flat',
  confidence: number,
  directionalScore: number,
  structureScore: number,
  minutesToNext: number,
  nextEvent: CalendarEvent | null,
): string {
  const side = direction === 'up' ? 'long' : direction === 'down' ? 'short' : 'wait'
  const strength = confidence >= 80 ? 'strongly' : confidence >= 65 ? 'clearly' : confidence >= 45 ? 'slightly' : 'weakly'
  const evidence = structureScore >= 70
    ? 'structure is clean and momentum is holding'
    : directionalScore >= 70
    ? 'momentum is clear, though structure still needs a cleaner confirmation'
    : structureScore >= 45
    ? 'price is leaning that way, but the structure is still mixed'
    : 'price action is still choppy'

  if (direction === 'flat') {
    return `${symbol} has no clean directional bias yet because ${evidence}, so wait for a sweep or displacement before choosing a side.`
  }

  if (nextEvent && minutesToNext < 45) {
    return `${symbol} ${strength} leans ${side} because ${evidence}, but ${nextEvent.title} is ${formatMinutes(minutesToNext)} away so wait for confirmation after the reaction.`
  }

  return `${symbol} ${strength} leans ${side} because ${evidence}, making that the preferred side on this timeframe.`
}

// ── Score → reason ────────────────────────────────────────────────────────────
function buildReason(
  score: number,
  direction: 'up' | 'down' | 'flat',
  directionalScore: number,
  structureScore: number,
  minutesToNext: number,
  nextEvent: CalendarEvent | null,
  hasData: boolean,
): string {
  if (!hasData) return 'Not enough candle data — market may be closed or data is loading.'

  const side = direction === 'up' ? 'long' : direction === 'down' ? 'short' : 'neutral'
  const eventText = nextEvent && minutesToNext < 45
    ? ` ${nextEvent.title} is ${formatMinutes(minutesToNext)} away, so require a post-news trigger.`
    : ''

  if (score >= 80) {
    return `High-confidence ${side} bias: direction and structure are aligned.${eventText}`
  }
  if (score >= 65) {
    return `Strong ${side} bias with workable confirmation: direction ${directionalScore}/100, structure ${structureScore}/100.${eventText}`
  }
  if (score >= 45) {
    return `Developing ${side} bias: there is directional lean, but structure needs confirmation.${eventText}`
  }
  return `Low-confidence ${side} bias: wait for displacement, liquidity sweep, or a cleaner retest before acting.`
}

// ── Main export ───────────────────────────────────────────────────────────────
export function computeEntryScore(
  candles: Candle[],
  events: CalendarEvent[],
  symbol: string,
  nowMs: number = Date.now(),
  interval = '1min',
  biasInterval = interval,
): EntryScoreResult {
  const hasData = candles.length >= 5

  const { score: trendScore, direction } = computeTrendScore(candles)
  const volatilityScore = computeVolatilityScore(candles)
  const { score: newsScore, minutesToNext, nextEvent, isHoliday } = computeNewsScore(events, symbol, nowMs)

  // Additional indicators
  const rsi          = computeRSI(candles)
  const ema20        = computeEMA(candles, 20)
  const atr          = computeATR(candles)
  const { support, resistance } = computeSwingLevels(candles)
  const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : null

  // Split events by timing
  const relevantEvts = events.filter(
    (e) =>
      (e.impact === 'High' || e.impact === 'Medium') && eventRelevantToSymbol(e, symbol),
  )
  const upcomingEvents = relevantEvts.filter((e) => e.timestamp > nowMs).slice(0, 4)
  const recentEvents   = relevantEvts.filter((e) => e.timestamp <= nowMs && e.timestamp > nowMs - 12 * 3_600_000).slice(0, 3)

  const signal = computeDirectionalSignal(
    candles,
    direction,
    trendScore,
    rsi,
    ema20,
    currentPrice,
    support,
    resistance,
    atr,
    newsScore,
  )

  const score = isHoliday
    ? 5
    : signal.confidence
  const reportDirection = isHoliday ? 'flat' : signal.direction

  const reason      = isHoliday
    ? `Bank holiday — ${nextEvent?.title ?? 'market holiday'} — markets are closed or very thin.`
    : buildReason(score, reportDirection, signal.directionalScore, signal.structureScore, minutesToNext, nextEvent, hasData)
  const analysis    = isHoliday
    ? `${symbol} is affected by a bank holiday today (${nextEvent?.title ?? 'market holiday'}). Liquidity is extremely thin. Do not trade.`
    : buildAnalysis(symbol, reportDirection, score, signal.directionalScore, signal.structureScore, minutesToNext, nextEvent)
  const deepAnalysis = buildDeepAnalysis({
    symbol, interval, trendScore, volatilityScore, direction: reportDirection,
    rsi, ema20, currentPrice, support, resistance, atr,
    minutesToNext, nextEvent, recentEvents, candles,
  })

  return {
    score,
    label: hasData ? toLabel(score, reportDirection) : 'No Data',
    reason, analysis, deepAnalysis,
    components: { trendScore: signal.directionalScore, volatilityScore: signal.structureScore, newsScore: signal.timingScore },
    rsi, ema20, currentPrice, support, resistance, direction: reportDirection, biasInterval, atr,
    upcomingEvents, recentEvents,
  }
}
