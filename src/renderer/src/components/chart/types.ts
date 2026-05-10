export type Timeframe = '1' | '5' | '15' | '30' | '60' | '240' | '1D' | '1W' | '1M'

export interface SymbolItem {
  symbol:   string
  name:     string
  type:     'FX' | 'CRYPTO' | 'FUTURES' | 'STOCK'
  exchange?: string
}

export const TF_LABEL: Record<Timeframe, string> = {
  '1': '1m', '5': '5m', '15': '15m', '30': '30m',
  '60': '1H', '240': '4H', '1D': '1D', '1W': '1W', '1M': '1M',
}

export const TF_ORDER: Timeframe[] = ['1','5','15','30','60','240','1D','1W','1M']

// Twelve Data interval string for each timeframe
export const TD_INTERVAL: Record<Timeframe, string> = {
  '1': '1min', '5': '5min', '15': '15min', '30': '30min',
  '60': '1h', '240': '4h', '1D': '1day', '1W': '1week', '1M': '1month',
}

// How often to poll for live updates (ms)
export const POLL_MS: Record<Timeframe, number> = {
  '1': 8_000, '5': 15_000, '15': 30_000, '30': 60_000,
  '60': 90_000, '240': 180_000, '1D': 300_000, '1W': 600_000, '1M': 600_000,
}

// Timeframes that a given API source cannot reliably serve
export const UNSUPPORTED_TFS: Record<string, Timeframe[]> = {
  biquote: ['1W', '1M'],
}
