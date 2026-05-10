import { create } from 'zustand'
import { fetchCandles, type Candle, type CandleApiSource } from '@renderer/lib/finnhub'
import { computeEntryScore, computeDirectionOnly, type CalendarEvent, type EntryScoreResult } from '@renderer/lib/confidence'
import { useDevLogStore } from '@renderer/store/devLogStore'
import { useSettingsStore } from '@renderer/store/settingsStore'

const INTERVAL_MAP: Record<string, string> = {
  '1': '1min', '5': '5min', '15': '15min', '30': '30min',
  '60': '1h', '240': '4h', '1D': '1day', '1W': '1week', '1M': '1month',
  'D': '1day', 'W': '1week',
}

// For these TFs, if direction is flat we try a higher TF for bias
const SHORT_TFS = new Set(['1', '5', '15', '30', '60'])
const BIAS_FALLBACKS: Array<{ key: string; td: string }> = [
  { key: '4H', td: '4h' },
  { key: '1D', td: '1day' },
]

interface MarketState {
  candles: Candle[]
  lastFetchedSymbol: string
  lastFetchedInterval: string
  lastFetchedAt: number | null
  nextRefreshAt: number | null
  fetchError: string | null
  entryScore: EntryScoreResult | null
  calendarEvents: CalendarEvent[]
  setNextRefreshAt: (t: number) => void
  /** Pass `symbolForScore` so the confidence meter updates correctly if the calendar loads after a symbol change */
  setCalendarEvents: (events: CalendarEvent[], symbolForScore?: string) => void
  refresh: (symbol: string, interval?: string) => Promise<void>
}

export const useMarketStore = create<MarketState>((set, get) => ({
  candles: [],
  lastFetchedSymbol: '',
  lastFetchedInterval: '1min',
  lastFetchedAt: null,
  nextRefreshAt: null,
  fetchError: null,
  entryScore: null,
  calendarEvents: [],

  setNextRefreshAt: (t) => set({ nextRefreshAt: t }),

  setCalendarEvents: (events, symbolForScore) => {
    set({ calendarEvents: events })
    const { candles, lastFetchedSymbol, lastFetchedInterval } = get()
    const sym = symbolForScore ?? lastFetchedSymbol
    if (sym && candles.length >= 5) {
      set({
        entryScore: computeEntryScore(candles, events, sym, Date.now(), lastFetchedInterval),
      })
    }
  },

  refresh: async (symbol: string, interval = '1D') => {
    try {
      const tdInterval = INTERVAL_MAP[interval] ?? '1day'
      const devTools   = useSettingsStore.getState().devToolsEnabled
      const addLog     = useDevLogStore.getState().addLog

      const onStatus = devTools
        ? (source: CandleApiSource, health: { status: string; message?: string }) => {
            if (health.status === 'rate_limited') {
              addLog(source as 'twelvedata' | 'biquote' | 'yahoo', `Rate limited on ${symbol} ${interval}${health.message ? ` — ${health.message}` : ''}`)
            }
          }
        : undefined

      const candles = await fetchCandles(symbol, 50, tdInterval, undefined, { onStatus })
      const events = get().calendarEvents

      let entryScore = computeEntryScore(candles, events, symbol, Date.now(), interval, interval)

      // Higher-TF fallback: if direction is flat on a short TF, check 4H then 1D for bias
      if (SHORT_TFS.has(interval) && entryScore.direction === 'flat') {
        for (const { key, td } of BIAS_FALLBACKS) {
          try {
            const higherCandles = await fetchCandles(symbol, 30, td)
            const higherDir = computeDirectionOnly(higherCandles)
            entryScore = { ...entryScore, biasInterval: key, direction: higherDir }
            if (higherDir !== 'flat') break
          } catch { break }
        }
      }

      set({ candles, lastFetchedSymbol: symbol, lastFetchedInterval: interval, lastFetchedAt: Date.now(), fetchError: null, entryScore })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ fetchError: message, entryScore: null, candles: [] })
      console.warn(`[MarketFeed] fetch failed for ${symbol}:`, message)
    }
  }
}))
