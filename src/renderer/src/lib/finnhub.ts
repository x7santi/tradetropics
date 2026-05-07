// Data feed backed by Twelve Data (twelvedata.com).
// File kept as finnhub.ts to avoid cascading import changes — the interface is the same.

export interface Candle {
  time: number   // unix timestamp (seconds)
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface Quote {
  price: number
  bid: number
  ask: number
  spread: number
}

export type AssetClass = 'stock' | 'forex' | 'crypto'
export type CandleFeedSource = 'twelvedata' | 'biquote' | 'yahoo' | 'cache' | 'synthetic'
export type CandleApiSource = 'twelvedata' | 'biquote' | 'yahoo'
export type CandleFeedStatus = 'idle' | 'ok' | 'rate_limited' | 'error'

export interface CandleFeedHealth {
  status: CandleFeedStatus
  message?: string
}

export interface FetchCandlesOptions {
  allowSyntheticOnCredit?: boolean
  onSource?: (source: CandleFeedSource) => void
  onStatus?: (source: CandleApiSource, health: CandleFeedHealth) => void
  preferredSource?: CandleApiSource | 'auto'
}

export class ApiCreditsExhaustedError extends Error {
  constructor(message = 'No API credits remaining. Chart data cannot update until Twelve Data credits reset or a new API key is added.') {
    super(message)
    this.name = 'ApiCreditsExhaustedError'
  }
}

export function classifySymbol(symbol: string): AssetClass {
  const forexPairs = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'USD/CHF', 'NZD/USD']
  const cryptoPairs = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'BNB/USD']
  if (forexPairs.includes(symbol)) return 'forex'
  if (cryptoPairs.includes(symbol)) return 'crypto'
  return 'stock'
}

interface TwelveDataValue {
  datetime: string
  open: string
  high: string
  low: string
  close: string
  volume: string
}

interface TwelveDataResponse {
  status: string
  code?: number
  message?: string
  values?: TwelveDataValue[]
}

interface BiQuoteBar {
  openTime: string
  open: number
  high: number
  low: number
  close: number
  volume?: number
  tickVolume?: number
  isOpen?: boolean
}

interface BiQuoteResponse {
  symbol?: string
  interval?: string
  bars?: BiQuoteBar[]
  message?: string
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[]
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>
          high?: Array<number | null>
          low?: Array<number | null>
          close?: Array<number | null>
          volume?: Array<number | null>
        }>
      }
    }>
    error?: { description?: string }
  }
}

const CANDLE_CACHE_PREFIX = 'tt_candles_cache_v1'
const CANDLE_API_SOURCES: CandleApiSource[] = ['twelvedata', 'biquote', 'yahoo']

function intervalSeconds(interval: string): number {
  if (interval.endsWith('min')) return parseInt(interval, 10) * 60
  if (interval.endsWith('h')) return parseInt(interval, 10) * 3_600
  if (interval === '1day') return 86_400
  if (interval === '1week') return 604_800
  if (interval === '1month') return 2_592_000
  return 60
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash)
}

function cacheKey(symbol: string, interval: string): string {
  return `${CANDLE_CACHE_PREFIX}:${symbol}:${interval}`
}

function readCachedCandles(symbol: string, interval: string, count: number): Candle[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(symbol, interval))
    if (!raw) return null
    const candles = JSON.parse(raw) as Candle[]
    if (!Array.isArray(candles) || candles.length === 0) return null
    return candles.slice(-count)
  } catch {
    return null
  }
}

function writeCachedCandles(symbol: string, interval: string, candles: Candle[]): void {
  try {
    localStorage.setItem(cacheKey(symbol, interval), JSON.stringify(candles.slice(-600)))
  } catch {
    // Cache is best-effort only.
  }
}

function basePriceFor(symbol: string): number {
  const known: Record<string, number> = {
    AAPL: 190,
    TSLA: 230,
    NVDA: 920,
    'EUR/USD': 1.085,
    'GBP/USD': 1.27,
    'USD/JPY': 155,
    'AUD/USD': 0.66,
    'USD/CAD': 1.37,
    'USD/CHF': 0.91,
    'NZD/USD': 0.60,
    'BTC/USD': 68000,
    'ETH/USD': 3500,
    'SOL/USD': 150,
    'BNB/USD': 590,
  }
  return known[symbol] ?? 100 + (hashString(symbol) % 200)
}

function generateFallbackCandles(symbol: string, count: number, interval: string): Candle[] {
  const step = intervalSeconds(interval)
  const now = Math.floor(Date.now() / 1000)
  const end = now - (now % step)
  const seed = hashString(`${symbol}:${interval}`)
  const asset = classifySymbol(symbol)
  const vol = asset === 'crypto' ? 0.012 : asset === 'forex' ? 0.0018 : 0.006
  const drift = ((seed % 200) - 100) / 100_000
  let close = basePriceFor(symbol)

  return Array.from({ length: count }, (_, i) => {
    const time = end - (count - 1 - i) * step
    const wave = Math.sin((i + seed % 31) / 5) * vol * 0.75
    const noise = Math.sin((i * 17 + seed) * 0.37) * vol * 0.45
    const open = close
    close = Math.max(open * (1 + drift + wave * 0.18 + noise), open * 0.6)
    const spread = Math.max(open, close) * vol * (0.45 + Math.abs(Math.sin(i + seed)) * 0.55)
    const high = Math.max(open, close) + spread
    const low = Math.min(open, close) - spread

    return {
      time,
      open,
      high,
      low,
      close,
      volume: asset === 'forex' ? 0 : Math.round(100_000 + Math.abs(Math.sin(i + seed)) * 900_000),
    }
  })
}

function isCreditLimitMessage(message: string): boolean {
  return /credit|quota|rate limit|too many requests|api limit|limit.*exceed|exceed.*limit|plan limit|http 429/i.test(message)
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function fetchJson<T>(url: string, sourceName: string, signal?: AbortSignal): Promise<T> {
  try {
    const res = await fetch(url, signal ? { signal } : undefined)
    if (!res.ok) throw new Error(`${sourceName} HTTP ${res.status}`)
    return await res.json() as T
  } catch (err) {
    if (signal?.aborted) throw err
    const nativeFetch = typeof window !== 'undefined' ? window.nativeFetch?.fetch : undefined
    if (!nativeFetch) throw err

    const body = await nativeFetch(url)
    try {
      return JSON.parse(body) as T
    } catch {
      throw new Error(`${sourceName} returned invalid JSON`)
    }
  }
}

function biQuoteSymbol(symbol: string): string {
  return symbol.replace('/', '').toUpperCase()
}

function biQuoteInterval(interval: string): string {
  const map: Record<string, string> = {
    '1min': '1m',
    '5min': '5m',
    '15min': '15m',
    '30min': '30m',
    '1h': '1h',
    '4h': '4h',
    '1day': '1d',
  }
  const mapped = map[interval]
  if (!mapped) throw new Error(`BiQuote does not support ${interval}`)
  return mapped
}

async function fetchBiQuoteCandles(symbol: string, count: number, interval: string, signal?: AbortSignal): Promise<Candle[]> {
  const bqSymbol = biQuoteSymbol(symbol)
  const bqInterval = biQuoteInterval(interval)
  const url = `https://biquote.io/api/${encodeURIComponent(bqSymbol)}/ohlc?interval=${encodeURIComponent(bqInterval)}&limit=${Math.min(count, 1000)}`

  const data = await fetchJson<BiQuoteResponse>(url, 'BiQuote', signal)
  if (!data.bars?.length) throw new Error(data.message ?? `No BiQuote candle data returned for ${symbol}`)

  return data.bars
    .map((bar) => ({
      time: Math.floor(new Date(bar.openTime).getTime() / 1000),
      open: Number(bar.open),
      high: Number(bar.high),
      low: Number(bar.low),
      close: Number(bar.close),
      volume: Number(bar.volume ?? bar.tickVolume ?? 0),
    }))
    .filter(c =>
      Number.isFinite(c.time) &&
      Number.isFinite(c.open) &&
      Number.isFinite(c.high) &&
      Number.isFinite(c.low) &&
      Number.isFinite(c.close)
    )
    .sort((a, b) => a.time - b.time)
    .slice(-count)
}

function yahooSymbol(symbol: string): string {
  if (classifySymbol(symbol) === 'forex') return `${symbol.replace('/', '')}=X`
  if (classifySymbol(symbol) === 'crypto') return symbol.replace('/', '-')
  return symbol
}

function yahooInterval(interval: string): string {
  const map: Record<string, string> = {
    '1min': '1m',
    '5min': '5m',
    '15min': '15m',
    '30min': '30m',
    '1h': '60m',
    '4h': '1h',
    '1day': '1d',
    '1week': '1wk',
    '1month': '1mo',
  }
  return map[interval] ?? '1d'
}

function yahooRange(interval: string, count: number): string {
  if (interval === '1min') return '7d'
  if (interval.endsWith('min')) return '60d'
  if (interval === '1h' || interval === '4h') return '730d'
  if (interval === '1week') return '10y'
  if (interval === '1month') return 'max'
  return count > 365 ? '5y' : '2y'
}

async function fetchYahooCandles(symbol: string, count: number, interval: string, signal?: AbortSignal): Promise<Candle[]> {
  const ySymbol = yahooSymbol(symbol)
  const yInterval = yahooInterval(interval)
  const range = yahooRange(interval, count)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySymbol)}?interval=${encodeURIComponent(yInterval)}&range=${encodeURIComponent(range)}`

  const data = await fetchJson<YahooChartResponse>(url, 'Yahoo Finance', signal)
  if (data.chart?.error) throw new Error(data.chart.error.description ?? 'Yahoo Finance chart error')

  const result = data.chart?.result?.[0]
  const timestamps = result?.timestamp
  const quote = result?.indicators?.quote?.[0]
  if (!timestamps?.length || !quote) throw new Error(`No Yahoo Finance candle data returned for ${symbol}`)

  const candles = timestamps.map((time, i) => {
    const open = quote.open?.[i]
    const high = quote.high?.[i]
    const low = quote.low?.[i]
    const close = quote.close?.[i]
    const volume = quote.volume?.[i] ?? 0

    if (open == null || high == null || low == null || close == null) return null
    return { time, open, high, low, close, volume }
  }).filter((c): c is Candle => c !== null)

  if (candles.length === 0) throw new Error(`No Yahoo Finance candle data returned for ${symbol}`)

  if (interval === '4h') {
    const grouped: Candle[] = []
    for (let i = 0; i < candles.length; i += 4) {
      const chunk = candles.slice(i, i + 4)
      if (chunk.length === 0) continue
      grouped.push({
        time: chunk[0].time,
        open: chunk[0].open,
        high: Math.max(...chunk.map(c => c.high)),
        low: Math.min(...chunk.map(c => c.low)),
        close: chunk[chunk.length - 1].close,
        volume: chunk.reduce((sum, c) => sum + (c.volume || 0), 0),
      })
    }
    return grouped.slice(-count)
  }

  return candles.slice(-count)
}

async function fetchTwelveDataCandles(symbol: string, count: number, interval: string, signal?: AbortSignal): Promise<Candle[]> {
  const apiKey = import.meta.env.VITE_TWELVEDATA_API_KEY as string
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${count}&apikey=${apiKey}`

  const res = await fetch(url, signal ? { signal } : undefined)
  if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status}`)

  const data: TwelveDataResponse = await res.json()

  if (data.status === 'error') {
    throw new Error(data.message ?? `No candle data returned for ${symbol}`)
  }

  if (!data.values?.length) throw new Error(`No candle data returned for ${symbol}`)

  // Values arrive newest-first — reverse to chronological order
  return [...data.values].reverse().map((v) => ({
    time: Math.floor(new Date(v.datetime).getTime() / 1000),
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
    volume: parseFloat(v.volume),
  }))
}

async function fetchCandlesFromSource(
  source: CandleApiSource,
  symbol: string,
  count: number,
  interval: string,
  signal?: AbortSignal,
): Promise<Candle[]> {
  if (source === 'twelvedata') return fetchTwelveDataCandles(symbol, count, interval, signal)
  if (source === 'biquote') return fetchBiQuoteCandles(symbol, count, interval, signal)
  return fetchYahooCandles(symbol, count, interval, signal)
}

function sourceOrder(preferredSource?: CandleApiSource | 'auto'): CandleApiSource[] {
  if (!preferredSource || preferredSource === 'auto') return CANDLE_API_SOURCES
  return [preferredSource]
}

export async function fetchCandles(
  symbol: string,
  count = 25,
  interval = '1min',
  signal?: AbortSignal,
  options: FetchCandlesOptions = {},
): Promise<Candle[]> {
  let firstError: unknown = null

  for (const source of sourceOrder(options.preferredSource)) {
    try {
      const candles = await fetchCandlesFromSource(source, symbol, count, interval, signal)
      if (candles.length === 0) throw new Error(`No candle data returned for ${symbol}`)

      writeCachedCandles(symbol, interval, candles)
      options.onStatus?.(source, { status: 'ok' })
      options.onSource?.(source)
      return candles
    } catch (err) {
      if (signal?.aborted) throw err
      firstError ??= err
      const message = errorMessage(err)
      options.onStatus?.(source, {
        status: isCreditLimitMessage(message) ? 'rate_limited' : 'error',
        message,
      })
      console.warn(`[MarketFeed] ${source} candles failed for ${symbol}.`, err)
    }
  }

  const cached = readCachedCandles(symbol, interval, count)
  if (cached) {
    console.warn(`[MarketFeed] Live feeds unavailable; using cached candles for ${symbol}.`, firstError)
    options.onSource?.('cache')
    return cached
  }

  const message = errorMessage(firstError)
  if (isCreditLimitMessage(message) && !options.allowSyntheticOnCredit) {
    throw new ApiCreditsExhaustedError()
  }

  console.warn(`[MarketFeed] Live feeds unavailable; using local fallback candles for ${symbol}.`, firstError)
  options.onSource?.('synthetic')
  return generateFallbackCandles(symbol, count, interval)
}

// Fetches current price for spread estimation.
export async function fetchQuote(symbol: string): Promise<Quote | null> {
  const apiKey = import.meta.env.VITE_TWELVEDATA_API_KEY as string
  const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`

  const res = await fetch(url)
  if (!res.ok) return null

  const data: { price?: string; status?: string } = await res.json()
  if (!data.price) return null

  const price = parseFloat(data.price)
  // Twelve Data free tier has no bid/ask — estimate spread as 0.02% of price
  const spread = price * 0.0002
  return { price, bid: price - spread / 2, ask: price + spread / 2, spread }
}
