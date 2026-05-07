import type { SymbolItem } from './types'

const CACHE_KEY = 'tt_symbol_cache_v3'
const CACHE_TTL = 24 * 3_600_000

interface Cache { fetchedAt: number; symbols: SymbolItem[] }

export const TYPE_ORDER: SymbolItem['type'][] = ['FX', 'CRYPTO', 'FUTURES', 'STOCK']
export const TYPE_ORDER_FREE: SymbolItem['type'][] = ['STOCK', 'FX', 'CRYPTO', 'FUTURES']

// Curated fallback list shown before the API cache is ready
export const FALLBACK: SymbolItem[] = [
  // FX
  { symbol: 'EUR/USD', name: 'Euro / US Dollar',             type: 'FX' },
  { symbol: 'GBP/USD', name: 'British Pound / US Dollar',    type: 'FX' },
  { symbol: 'USD/JPY', name: 'US Dollar / Japanese Yen',     type: 'FX' },
  { symbol: 'AUD/USD', name: 'Australian Dollar / USD',      type: 'FX' },
  { symbol: 'USD/CAD', name: 'US Dollar / Canadian Dollar',  type: 'FX' },
  { symbol: 'USD/CHF', name: 'US Dollar / Swiss Franc',      type: 'FX' },
  { symbol: 'NZD/USD', name: 'New Zealand Dollar / USD',     type: 'FX' },
  { symbol: 'EUR/JPY', name: 'Euro / Japanese Yen',          type: 'FX' },
  { symbol: 'GBP/JPY', name: 'British Pound / Yen',          type: 'FX' },
  { symbol: 'EUR/GBP', name: 'Euro / British Pound',         type: 'FX' },
  { symbol: 'USD/SGD', name: 'US Dollar / Singapore Dollar', type: 'FX' },
  { symbol: 'USD/MXN', name: 'US Dollar / Mexican Peso',     type: 'FX' },
  { symbol: 'USD/ZAR', name: 'US Dollar / South African Rand', type: 'FX' },
  { symbol: 'EUR/CHF', name: 'Euro / Swiss Franc',           type: 'FX' },
  { symbol: 'AUD/JPY', name: 'Australian Dollar / Yen',      type: 'FX' },

  // Crypto
  { symbol: 'BTC/USD',  name: 'Bitcoin',   type: 'CRYPTO' },
  { symbol: 'ETH/USD',  name: 'Ethereum',  type: 'CRYPTO' },
  { symbol: 'SOL/USD',  name: 'Solana',    type: 'CRYPTO' },
  { symbol: 'BNB/USD',  name: 'BNB',       type: 'CRYPTO' },
  { symbol: 'XRP/USD',  name: 'Ripple',    type: 'CRYPTO' },
  { symbol: 'ADA/USD',  name: 'Cardano',   type: 'CRYPTO' },
  { symbol: 'DOGE/USD', name: 'Dogecoin',  type: 'CRYPTO' },
  { symbol: 'AVAX/USD', name: 'Avalanche', type: 'CRYPTO' },
  { symbol: 'LINK/USD', name: 'Chainlink', type: 'CRYPTO' },
  { symbol: 'DOT/USD',  name: 'Polkadot',  type: 'CRYPTO' },
  { symbol: 'MATIC/USD',name: 'Polygon',   type: 'CRYPTO' },
  { symbol: 'LTC/USD',  name: 'Litecoin',  type: 'CRYPTO' },

  // ETFs
  { symbol: 'SPY',  name: 'S&P 500 ETF (SPDR)',            type: 'STOCK', exchange: 'NYSE'   },
  { symbol: 'QQQ',  name: 'Nasdaq-100 ETF (Invesco)',       type: 'STOCK', exchange: 'NASDAQ' },
  { symbol: 'IWM',  name: 'Russell 2000 ETF (iShares)',     type: 'STOCK', exchange: 'NYSE'   },
  { symbol: 'DIA',  name: 'Dow Jones ETF (SPDR)',           type: 'STOCK', exchange: 'NYSE'   },
  { symbol: 'GLD',  name: 'Gold ETF (SPDR)',                type: 'STOCK', exchange: 'NYSE'   },
  { symbol: 'SLV',  name: 'Silver ETF (iShares)',           type: 'STOCK', exchange: 'NYSE'   },
  { symbol: 'USO',  name: 'US Oil Fund ETF',                type: 'STOCK', exchange: 'NYSE'   },
  { symbol: 'UNG',  name: 'US Natural Gas Fund ETF',        type: 'STOCK', exchange: 'NYSE'   },
  { symbol: 'TLT',  name: '20+ Year Treasury Bond ETF',     type: 'STOCK', exchange: 'NASDAQ' },
  { symbol: 'IEF',  name: '7-10 Year Treasury Bond ETF',    type: 'STOCK', exchange: 'NASDAQ' },
  { symbol: 'HYG',  name: 'High Yield Corporate Bond ETF',  type: 'STOCK', exchange: 'NYSE'   },
  { symbol: 'EEM',  name: 'Emerging Markets ETF (iShares)', type: 'STOCK', exchange: 'NYSE'   },
  { symbol: 'EFA',  name: 'EAFE ETF (iShares)',             type: 'STOCK', exchange: 'NYSE'   },
  { symbol: 'VXX',  name: 'Short-Term VIX Futures ETF',     type: 'STOCK', exchange: 'CBOE'   },
  { symbol: 'UVXY', name: '1.5x Long VIX Futures ETF',      type: 'STOCK', exchange: 'CBOE'   },
  { symbol: 'SVXY', name: '0.5x Short VIX Futures ETF',     type: 'STOCK', exchange: 'CBOE'   },
  { symbol: 'SMH',  name: 'Semiconductors ETF (VanEck)',    type: 'STOCK', exchange: 'NASDAQ' },
  { symbol: 'SOXX', name: 'Semiconductors ETF (iShares)',   type: 'STOCK', exchange: 'NASDAQ' },
  { symbol: 'XLF',  name: 'Financials Select SPDR ETF',     type: 'STOCK', exchange: 'NYSE'   },
  { symbol: 'XLE',  name: 'Energy Select SPDR ETF',         type: 'STOCK', exchange: 'NYSE'   },
  { symbol: 'XLU',  name: 'Utilities Select SPDR ETF',      type: 'STOCK', exchange: 'NYSE'   },
  { symbol: 'XBI',  name: 'Biotech ETF (SPDR)',             type: 'STOCK', exchange: 'NYSE'   },
  { symbol: 'ARKK', name: 'ARK Innovation ETF',             type: 'STOCK', exchange: 'NYSE'   },
  { symbol: 'ARKG', name: 'ARK Genomic Revolution ETF',     type: 'STOCK', exchange: 'NYSE'   },
  { symbol: 'IBIT', name: 'Bitcoin ETF (iShares)',          type: 'STOCK', exchange: 'NASDAQ' },
  { symbol: 'FBTC', name: 'Bitcoin ETF (Fidelity)',         type: 'STOCK', exchange: 'CBOE'   },

  // Futures
  { symbol: 'ES1!',  name: 'S&P 500 Futures (CME)',         type: 'FUTURES' },
  { symbol: 'NQ1!',  name: 'Nasdaq-100 Futures (CME)',      type: 'FUTURES' },
  { symbol: 'YM1!',  name: 'Dow Jones Futures (CBOT)',      type: 'FUTURES' },
  { symbol: 'RTY1!', name: 'Russell 2000 Futures (CME)',    type: 'FUTURES' },
  { symbol: 'CL1!',  name: 'Crude Oil WTI Futures (NYMEX)', type: 'FUTURES' },
  { symbol: 'NG1!',  name: 'Natural Gas Futures (NYMEX)',   type: 'FUTURES' },
  { symbol: 'GC1!',  name: 'Gold Futures (COMEX)',          type: 'FUTURES' },
  { symbol: 'SI1!',  name: 'Silver Futures (COMEX)',        type: 'FUTURES' },
  { symbol: 'HG1!',  name: 'Copper Futures (COMEX)',        type: 'FUTURES' },
  { symbol: 'ZB1!',  name: '30-Year T-Bond Futures (CBOT)', type: 'FUTURES' },
  { symbol: 'ZN1!',  name: '10-Year T-Note Futures (CBOT)', type: 'FUTURES' },
  { symbol: 'ZF1!',  name: '5-Year T-Note Futures (CBOT)',  type: 'FUTURES' },
  { symbol: 'ZC1!',  name: 'Corn Futures (CBOT)',           type: 'FUTURES' },
  { symbol: 'ZW1!',  name: 'Wheat Futures (CBOT)',          type: 'FUTURES' },
  { symbol: 'ZS1!',  name: 'Soybean Futures (CBOT)',        type: 'FUTURES' },
  { symbol: 'BTC1!', name: 'Bitcoin Futures (CME)',         type: 'FUTURES' },
  { symbol: 'ETH1!', name: 'Ethereum Futures (CME)',        type: 'FUTURES' },
  { symbol: 'VX1!',  name: 'VIX Futures (CBOE)',            type: 'FUTURES' },
  { symbol: 'DX1!',  name: 'US Dollar Index Futures (ICE)', type: 'FUTURES' },
  { symbol: 'MES1!', name: 'Micro S&P 500 Futures (CME)',   type: 'FUTURES' },
  { symbol: 'MNQ1!', name: 'Micro Nasdaq-100 Futures (CME)',type: 'FUTURES' },
]

let _loaded: SymbolItem[] | null = null

function loadCache(): SymbolItem[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const c: Cache = JSON.parse(raw)
    if (Date.now() - c.fetchedAt > CACHE_TTL) return null
    return c.symbols
  } catch { return null }
}

function saveCache(symbols: SymbolItem[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), symbols }))
  } catch { /* storage full — skip */ }
}

async function fetchFromAPI(): Promise<SymbolItem[]> {
  const key = import.meta.env.VITE_TWELVEDATA_API_KEY as string
  const base = 'https://api.twelvedata.com'

  const [stocks, forex, crypto] = await Promise.allSettled([
    fetch(`${base}/stocks?country=US&apikey=${key}`).then(r => r.json()),
    fetch(`${base}/forex_pairs?apikey=${key}`).then(r => r.json()),
    fetch(`${base}/cryptocurrencies?apikey=${key}`).then(r => r.json()),
  ])

  const symbols: SymbolItem[] = [...FALLBACK]
  const seen = new Set(FALLBACK.map(s => s.symbol))

  if (stocks.status === 'fulfilled' && stocks.value?.data) {
    for (const s of stocks.value.data) {
      if (!seen.has(s.symbol)) {
        symbols.push({ symbol: s.symbol, name: s.name ?? s.symbol, type: 'STOCK', exchange: s.exchange })
        seen.add(s.symbol)
      }
    }
  }

  if (forex.status === 'fulfilled' && forex.value?.data) {
    for (const s of forex.value.data) {
      if (!seen.has(s.symbol)) {
        const name = s.currency_base && s.currency_quote
          ? `${s.currency_base} / ${s.currency_quote}`
          : s.symbol
        symbols.push({ symbol: s.symbol, name, type: 'FX' })
        seen.add(s.symbol)
      }
    }
  }

  if (crypto.status === 'fulfilled' && crypto.value?.data) {
    for (const s of crypto.value.data) {
      if (!seen.has(s.symbol)) {
        const name = s.currency_base ?? s.symbol
        symbols.push({ symbol: s.symbol, name, type: 'CRYPTO' })
        seen.add(s.symbol)
      }
    }
  }

  return symbols
}

export async function getSymbols(): Promise<SymbolItem[]> {
  if (_loaded) return _loaded
  const cached = loadCache()
  if (cached) { _loaded = cached; return cached }

  try {
    const symbols = await fetchFromAPI()
    saveCache(symbols)
    _loaded = symbols
    return symbols
  } catch {
    _loaded = FALLBACK
    return FALLBACK
  }
}

function typeRank(type: SymbolItem['type']): number {
  return TYPE_ORDER.indexOf(type)
}

export function searchSymbols(symbols: SymbolItem[], query: string): SymbolItem[] {
  if (!query.trim()) {
    return [...FALLBACK].sort((a, b) => typeRank(a.type) - typeRank(b.type))
  }

  const q = query.toLowerCase().trim()
  const exact    = symbols.filter(s => s.symbol.toLowerCase() === q)
  const starts   = symbols.filter(s => s.symbol.toLowerCase().startsWith(q) && !exact.includes(s))
  const contains = symbols.filter(s =>
    (s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)) &&
    !exact.includes(s) && !starts.includes(s)
  )

  return [...exact, ...starts, ...contains].slice(0, 40)
}
