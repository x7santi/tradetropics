import { useEffect, useRef, useState } from 'react'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import {
  fetchCandles,
  type CandleApiSource,
  type CandleFeedHealth,
  type CandleFeedSource,
} from '@renderer/lib/finnhub'
import { computeRSISeries } from '@renderer/lib/confidence'
import { TD_INTERVAL, POLL_MS, type Timeframe } from './types'

// How many bars to show in the initial view after load (undefined = fit all)
const INITIAL_VIEW_BARS: Partial<Record<string, number>> = {
  '1min': 80, '5min': 80, '15min': 80,
  '30min': 60, '1h': 60, '4h': 60,
}

export type CandleSourcePreference = CandleApiSource | 'auto'
export type CandleFeedHealthMap = Record<CandleApiSource, CandleFeedHealth>

const INITIAL_HEALTH: CandleFeedHealthMap = {
  twelvedata: { status: 'idle' },
  biquote: { status: 'idle' },
  yahoo: { status: 'idle' },
}

export function useCandles(
  symbol:         string,
  timeframe:      Timeframe,
  candleSeriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>,
  volumeSeriesRef: React.RefObject<ISeriesApi<'Histogram'> | null>,
  chartRef:        React.RefObject<IChartApi | null>,
  preferredSource: CandleSourcePreference = 'auto',
  refreshKey:     number = 0,
  rsiSeriesRef?:  React.RefObject<ISeriesApi<'Line'> | null>,
) {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [feedSource, setFeedSource] = useState<CandleFeedSource | null>(null)
  const [feedHealth, setFeedHealth] = useState<CandleFeedHealthMap>(INITIAL_HEALTH)

  const abortRef = useRef<AbortController | null>(null)
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    // Cancel previous fetch + poll
    abortRef.current?.abort()
    if (pollRef.current) clearInterval(pollRef.current)

    const abort = new AbortController()
    abortRef.current = abort

    const tdInterval = TD_INTERVAL[timeframe]

    async function loadHistory() {
      setLoading(true)
      setError(null)
      setFeedSource(null)
      setFeedHealth(INITIAL_HEALTH)
      try {
        // Daily bars: fetch 6 years (~1512 trading days); intraday: 500 bars is sufficient
        const barCount = tdInterval === '1day' ? 1512 : tdInterval === '1week' ? 520 : 500
        const candles = await fetchCandles(symbol, barCount, tdInterval, abort.signal, {
          allowSyntheticOnCredit: true,
          onSource: setFeedSource,
          onStatus: (source, health) => {
            setFeedHealth(current => ({ ...current, [source]: health }))
          },
          preferredSource,
        })
        if (abort.signal.aborted) return
        if (!candleSeriesRef.current || !volumeSeriesRef.current || !chartRef.current) return
        if (candles.length === 0) throw new Error(`No candle data returned for ${symbol}`)

        const bars = candles.map(c => ({
          time:  c.time as number,
          open:  c.open,
          high:  c.high,
          low:   c.low,
          close: c.close,
        }))
        // Forex and some other symbols don't report volume — guard against NaN
        const vols = candles
          .filter(c => Number.isFinite(c.volume) && c.volume > 0)
          .map(c => ({
            time:  c.time as number,
            value: c.volume,
            color: c.close >= c.open ? 'rgba(20,184,166,0.35)' : 'rgba(239,68,68,0.35)',
          }))

        candleSeriesRef.current.setData(bars)
        volumeSeriesRef.current.setData(vols)

        // RSI 14 sub-panel
        if (rsiSeriesRef?.current) {
          const rsiValues = computeRSISeries(candles, 14)
          const rsiBars = candles
            .map((c, i) => rsiValues[i] !== null ? { time: c.time as number, value: rsiValues[i]! } : null)
            .filter((x): x is { time: number; value: number } => x !== null)
          rsiSeriesRef.current.setData(rsiBars)
        }

        const chart    = chartRef.current
        const viewBars = INITIAL_VIEW_BARS[tdInterval]
        chart.priceScale('right').applyOptions({ autoScale: true })
        if (viewBars && bars.length > viewBars) {
          chart.timeScale().setVisibleLogicalRange({
            from: bars.length - viewBars,
            to:   bars.length,
          })
        } else {
          chart.timeScale().fitContent()
        }
      } catch (err) {
        if (abort.signal.aborted) return
        const msg = err instanceof Error ? err.message : 'Failed to load chart data'
        setError(msg)
        console.warn('[useCandles]', msg)
      } finally {
        if (!abort.signal.aborted) setLoading(false)
      }
    }

    async function pollUpdate() {
      try {
        let liveSource: CandleFeedSource | null = null
        const candles = await fetchCandles(symbol, 2, tdInterval, undefined, {
          preferredSource,
          onSource: (src) => { liveSource = src },
        })
        // Skip update if data is stale — only apply real live data
        if (liveSource === 'cache' || liveSource === 'synthetic') return
        if (!candleSeriesRef.current || candles.length === 0) return

        // Update last two bars so the forming candle stays live
        for (const c of candles) {
          candleSeriesRef.current.update({
            time:  c.time as number,
            open:  c.open,
            high:  c.high,
            low:   c.low,
            close: c.close,
          })
          if (volumeSeriesRef.current && Number.isFinite(c.volume) && c.volume > 0) {
            volumeSeriesRef.current.update({
              time:  c.time as number,
              value: c.volume,
              color: c.close >= c.open ? 'rgba(20,184,166,0.35)' : 'rgba(239,68,68,0.35)',
            })
          }
        }

        // Update feed source indicator on successful live poll
        setFeedSource(liveSource)
      } catch { /* ignore poll errors */ }
    }

    loadHistory().then(() => {
      if (abort.signal.aborted) return
      pollRef.current = setInterval(pollUpdate, POLL_MS[timeframe])
    })

    return () => {
      abort.abort()
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [symbol, timeframe, preferredSource, refreshKey])

  return { loading, error, feedSource, feedHealth }
}
