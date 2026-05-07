// Maps chart interval values → confidence meter refresh period.
// Capped at 1hr for slow timeframes — waiting hours between updates is too infrequent.
export const INTERVAL_REFRESH_MS: Record<string, number> = {
  '1':   30_000,        // 30s (2× per candle)
  '5':   5  * 60_000,
  '15':  15 * 60_000,
  '30':  30 * 60_000,
  '60':  60 * 60_000,
  '240': 60 * 60_000,   // cap at 1hr
  '1D':  60 * 60_000,   // cap at 1hr
  '1W':  60 * 60_000,   // cap at 1hr
  '1M':  60 * 60_000,   // cap at 1hr
  // Legacy TradingView format (may still be in Supabase for some users)
  'D':   60 * 60_000,
  'W':   60 * 60_000,
}

export function getRefreshMs(interval: string): number {
  return INTERVAL_REFRESH_MS[interval] ?? 60_000
}

// Returns how long to wait before the first scheduled refresh, aligned to candle close.
export function msUntilNextCandleClose(interval: string): number {
  if (interval === '1') return 30_000

  const refreshMs = getRefreshMs(interval)

  // Capped/slow intervals: skip alignment, just use the full period
  if (['240', '1D', '1W', '1M', 'D', 'W'].includes(interval)) return refreshMs

  // Align to the next wall-clock multiple of the interval
  const msUntilNext = refreshMs - (Date.now() % refreshMs)
  return msUntilNext + 2_000  // 2s buffer so the candle is definitely closed
}
