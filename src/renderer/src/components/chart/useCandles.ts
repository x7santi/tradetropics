import { useEffect, useRef, useState } from 'react'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import {
  fetchCandles,
  type CandleApiSource,
  type CandleFeedHealth,
  type CandleFeedSource,
} from '@renderer/lib/finnhub'
import { TD_INTERVAL, POLL_MS, type Timeframe } from './types'

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
        const candles = await fetchCandles(symbol, 500, tdInterval, abort.signal, {
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
        chartRef.current.timeScale().fitContent()
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
        const candles = await fetchCandles(symbol, 2, tdInterval, undefined, {
          allowSyntheticOnCredit: true,
          preferredSource,
        })
        if (!candleSeriesRef.current || candles.length === 0) return
        const last = candles[candles.length - 1]
        candleSeriesRef.current.update({
          time:  last.time as number,
          open:  last.open,
          high:  last.high,
          low:   last.low,
          close: last.close,
        })
        if (volumeSeriesRef.current && Number.isFinite(last.volume) && last.volume > 0) {
          volumeSeriesRef.current.update({
            time:  last.time as number,
            value: last.volume,
            color: last.close >= last.open ? 'rgba(20,184,166,0.35)' : 'rgba(239,68,68,0.35)',
          })
        }
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
