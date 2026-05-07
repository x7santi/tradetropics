import { useRef, useEffect, useState } from 'react'
import { useChartStore } from '@renderer/store/chartStore'
import { useSettingsStore, BG_COLORS } from '@renderer/store/settingsStore'
import { useChart }      from './useChart'
import { useCandles, type CandleSourcePreference } from './useCandles'
import SymbolSearch      from './SymbolSearch'
import TimeframePills    from './TimeframePills'
import type { Timeframe } from './types'

const FEED_LABELS: Record<string, string> = {
  twelvedata: 'Twelve Data',
  biquote: 'BiQuote',
  yahoo: 'Yahoo Finance',
  cache: 'Cached',
  synthetic: 'Fallback',
}

const FEED_OPTIONS: Array<{ value: CandleSourcePreference; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'twelvedata', label: 'Twelve Data' },
  { value: 'biquote', label: 'BiQuote' },
  { value: 'yahoo', label: 'Yahoo Finance' },
]

const FEED_PREF_KEY = 'tt-candle-feed-preference'

function readFeedPreference(): CandleSourcePreference {
  try {
    const saved = localStorage.getItem(FEED_PREF_KEY)
    if (saved === 'twelvedata' || saved === 'biquote' || saved === 'yahoo' || saved === 'auto') return saved
  } catch {
    // Ignore storage errors.
  }
  return 'auto'
}

function feedPillClass(feedSource: string | null): string {
  if (feedSource === 'synthetic') return 'border-red-400/25 bg-red-500/10 text-red-300'
  if (feedSource === 'cache') return 'border-blue-400/25 bg-blue-500/10 text-blue-300'
  return 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300'
}

function feedDotClass(feedSource: string | null): string {
  if (feedSource === 'synthetic') return 'bg-red-300'
  if (feedSource === 'cache') return 'bg-blue-300'
  return 'bg-emerald-300'
}

export default function ChartPanel(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const feedMenuRef = useRef<HTMLDivElement>(null)
  const { chartRef, candleSeriesRef, volumeSeriesRef } = useChart(containerRef)
  const [feedPreference, setFeedPreference] = useState<CandleSourcePreference>(readFeedPreference)
  const [feedMenuOpen, setFeedMenuOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const symbol    = useChartStore(s => s.symbol)
  const interval  = useChartStore(s => s.interval) as Timeframe

  const getCandleTheme = useSettingsStore(s => s.getCandleTheme)
  const candleThemeId  = useSettingsStore(s => s.candleThemeId)
  const chartBgMode    = useSettingsStore(s => s.chartBgMode)

  // Apply candle colours + bg/grid whenever theme or bg mode changes
  useEffect(() => {
    const series = candleSeriesRef.current
    const chart  = chartRef.current
    if (!series || !chart) return
    const theme  = getCandleTheme()
    const bgCols = BG_COLORS[chartBgMode]
    series.applyOptions({
      upColor: theme.upColor, downColor: theme.downColor,
      borderVisible: theme.borderVisible ?? false,
      borderUpColor: theme.borderUpColor,
      borderDownColor: theme.borderDownColor,
      wickUpColor: theme.wickUpColor, wickDownColor: theme.wickDownColor,
    })
    chart.applyOptions({
      layout: { background: { type: 'solid' as const, color: bgCols.bg }, textColor: bgCols.text },
      grid:   { vertLines: { color: bgCols.grid }, horzLines: { color: bgCols.grid } },
      timeScale:       { borderColor: bgCols.border },
      rightPriceScale: { borderColor: bgCols.border },
    })
  }, [candleThemeId, chartBgMode])

  const { loading, error, feedSource, feedHealth } = useCandles(
    symbol, interval, candleSeriesRef, volumeSeriesRef, chartRef, feedPreference, refreshKey
  )

  const setPreferredFeed = (source: CandleSourcePreference) => {
    setFeedPreference(source)
    try { localStorage.setItem(FEED_PREF_KEY, source) } catch { /* ignore storage errors */ }
    setFeedMenuOpen(false)
  }

  useEffect(() => {
    if (!feedMenuOpen) return

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (feedMenuRef.current?.contains(event.target as Node)) return
      setFeedMenuOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [feedMenuOpen])

  const animateLogicalRange = (
    fromRange: { from: number; to: number },
    toRange: { from: number; to: number },
    duration = 220,
    onDone?: () => void,
  ) => {
    const chart = chartRef.current
    if (!chart) return
    const startedAt = performance.now()
    const ease = (t: number) => 1 - Math.pow(1 - t, 3)

    const tick = (now: number) => {
      const t = Math.min((now - startedAt) / duration, 1)
      const e = ease(t)
      chart.timeScale().setVisibleLogicalRange({
        from: fromRange.from + (toRange.from - fromRange.from) * e,
        to:   fromRange.to   + (toRange.to   - fromRange.to)   * e,
      })
      if (t < 1) requestAnimationFrame(tick)
      else onDone?.()
    }

    requestAnimationFrame(tick)
  }

  const refocusLatest = () => {
    const chart = chartRef.current
    if (!chart) return

    chart.priceScale('right').applyOptions({ autoScale: true })
    chart.timeScale().fitContent()
    chart.timeScale().scrollToPosition(0, false)

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const range = chart.timeScale().getVisibleLogicalRange()
        if (!range) return

        const targetWidth = (range.to - range.from) / 4
        animateLogicalRange(
          range,
          { from: range.to - targetWidth, to: range.to },
          520,
        )
      })
    })
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-surface-1 border-b border-glass shrink-0 flex-wrap gap-y-1">
        <SymbolSearch />
        <div className="w-px h-4 bg-glass/60 shrink-0" />
        <TimeframePills />

        <div className="ml-auto flex items-center gap-1.5">
          {(feedSource || feedPreference) && (
            <div ref={feedMenuRef} className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => setFeedMenuOpen(open => !open)}
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors ${feedPillClass(feedSource)}`}
                title="Change candle API"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${feedDotClass(feedSource)}`} />
                <span>{feedSource ? FEED_LABELS[feedSource] : 'Auto'}</span>
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m3 5 3 3 3-3" />
                </svg>
              </button>

              {feedMenuOpen && (
              <div className="absolute right-0 top-full z-30 w-60 pt-2">
                <div className="rounded-lg border border-glass bg-surface-1/95 p-1.5 shadow-xl backdrop-blur">
                  <div className="flex items-center justify-between px-2 pb-1.5">
                    <span className="text-[9px] uppercase tracking-[0.12em] text-slate-500">Candle API</span>
                    <span className="text-[9px] text-slate-500">
                      Selected: {FEED_OPTIONS.find(option => option.value === feedPreference)?.label}
                    </span>
                  </div>
                  {FEED_OPTIONS.map(option => {
                    const health = option.value === 'auto' ? null : feedHealth[option.value]
                    const statusLabel = !health
                      ? 'Fallback chain'
                      : health.status === 'ok'
                        ? 'Working'
                        : health.status === 'rate_limited'
                          ? 'Rate limited'
                          : health.status === 'error'
                            ? 'Unavailable'
                            : 'Not checked'
                    const statusClass = !health
                      ? 'bg-blue-300 text-blue-300'
                      : health.status === 'ok'
                        ? 'bg-emerald-300 text-emerald-300'
                        : health.status === 'rate_limited'
                          ? 'bg-amber-300 text-amber-300'
                          : health.status === 'error'
                            ? 'bg-red-400 text-red-300'
                            : 'bg-slate-500 text-slate-500'
                    const dotClass = statusClass.split(' ')[0]
                    const textClass = statusClass.split(' ')[1]
                    const active = feedPreference === option.value

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setPreferredFeed(option.value)}
                        title={health?.message}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors ${
                          active ? 'bg-blue-500/15 text-blue-200' : 'text-slate-300 hover:bg-white/[0.06] hover:text-slate-100'
                        }`}
                      >
                        <span className={`h-2 w-2 rounded-full ${dotClass}`} />
                        <span className="flex-1">{option.label}</span>
                        <span className={`text-[9px] ${textClass}`}>{statusLabel}</span>
                      </button>
                    )
                  })}
                  <p className="px-2 pt-1.5 text-[9px] leading-snug text-slate-500">
                    Auto tries live APIs in order. Choosing one API uses only that feed before cache/fallback.
                  </p>
                </div>
              </div>
              )}
            </div>
          )}
          {loading && (
            <div className="flex items-center gap-1.5 text-slate-400 text-[10px]">
              <div className="w-2.5 h-2.5 border border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
              Loading…
            </div>
          )}
          {error && !loading && (
            <span className="text-[10px] text-red-400 max-w-48 truncate" title={error}>
              {error}
            </span>
          )}

          {/* Zoom controls */}
          <div className="flex items-center rounded-md border border-glass overflow-hidden">
            <button
              onClick={() => {
                const chart = chartRef.current
                if (!chart) return
                const range = chart.timeScale().getVisibleLogicalRange()
                if (!range) return
                const center = (range.from + range.to) / 2
                const half   = (range.to - range.from) / 2
                chart.timeScale().setVisibleLogicalRange({ from: center - half * 0.7, to: center + half * 0.7 })
              }}
              title="Zoom in"
              className="flex items-center justify-center w-6 h-6 text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] transition-colors border-r border-glass"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="5" cy="5" r="4"/>
                <path d="M8.5 8.5 11 11M5 3v4M3 5h4"/>
              </svg>
            </button>
            <button
              onClick={() => {
                const chart = chartRef.current
                if (!chart) return
                const range = chart.timeScale().getVisibleLogicalRange()
                if (!range) return
                const center = (range.from + range.to) / 2
                const half   = (range.to - range.from) / 2
                chart.timeScale().setVisibleLogicalRange({ from: center - half * 1.4, to: center + half * 1.4 })
              }}
              title="Zoom out"
              className="flex items-center justify-center w-6 h-6 text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="5" cy="5" r="4"/>
                <path d="M8.5 8.5 11 11M3 5h4"/>
              </svg>
            </button>
          </div>

          <button
            onClick={() => setRefreshKey(k => k + 1)}
            disabled={loading}
            title="Refresh chart data"
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] transition-colors text-[10px] disabled:opacity-40"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={loading ? 'animate-spin' : ''}>
              <path d="M10 6A4 4 0 1 1 8 2.27"/>
              <path d="M8 1v3h3"/>
            </svg>
            Refresh
          </button>

          <button
            onClick={refocusLatest}
            title="Refocus latest candles"
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] transition-colors text-[10px]"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 1v8M2 6l4 4 4-4"/>
            </svg>
            Refocus
          </button>

          <button
            onClick={() => {
              const chart = chartRef.current
              if (!chart) return
              chart.priceScale('right').applyOptions({ autoScale: true })
              chart.timeScale().fitContent()
            }}
            title="Reset view"
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] transition-colors text-[10px]"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 6a5 5 0 1 0 5-5 5 5 0 0 0-3.5 1.4L1 1"/>
              <path d="M1 1v3h3"/>
            </svg>
            Reset view
          </button>
        </div>
      </div>

      {/* Chart canvas — hidden until session loaded to avoid flash */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0"
      />
    </div>
  )
}
