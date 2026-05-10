import { useRef, useEffect, useState, useCallback } from 'react'
import type { IPriceLine } from 'lightweight-charts'
import { useChartStore } from '@renderer/store/chartStore'
import { useSettingsStore, BG_COLORS } from '@renderer/store/settingsStore'
import { useAnnotationStore } from '@renderer/store/annotationStore'
import { useChart, makeTickMarkFormatter } from './useChart'
import { useCandles, type CandleSourcePreference } from './useCandles'
import SymbolSearch      from './SymbolSearch'
import TimeframePills    from './TimeframePills'
import type { Timeframe } from './types'
import { UNSUPPORTED_TFS } from './types'

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
  } catch { /* ignore */ }
  return 'auto'
}

// ── Market status ─────────────────────────────────────────────────────────────

type AssetClass  = 'crypto' | 'forex' | 'stock'
type MarketStatus = 'live' | 'closed' | 'stale'

const CRYPTO_BASES = ['BTC','ETH','XRP','SOL','ADA','DOT','AVAX','DOGE','LTC','BCH','LINK','UNI','MATIC','ATOM','XLM','ALGO','VET','ICP','NEAR','FTM','SHIB','TRX','ETC','BNB']
const FX_CCYS      = ['USD','EUR','GBP','JPY','CHF','AUD','NZD','CAD','SEK','NOK','DKK','SGD','HKD','MXN','ZAR','TRY','PLN','CNH','CNY']

function detectAssetClass(symbol: string): AssetClass {
  const s = symbol.toUpperCase().replace(/[/\-_]/, '')
  if (
    (CRYPTO_BASES.some(b => s.startsWith(b)) &&
     (s.endsWith('USD') || s.endsWith('USDT') || s.endsWith('BTC') || s.endsWith('ETH') || s.endsWith('EUR'))) ||
    s.endsWith('USDT') || s.endsWith('BUSD')
  ) return 'crypto'
  if (s.length === 6 && FX_CCYS.some(c => s.startsWith(c)) && FX_CCYS.some(c => s.endsWith(c))) return 'forex'
  return 'stock'
}

function isForexOpen(now: Date): boolean {
  const day  = now.getUTCDay()
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes()
  if (day === 6) return false                     // Saturday: always closed
  if (day === 0 && mins < 22 * 60) return false   // Sunday before Sydney open (22:00 UTC)
  if (day === 5 && mins >= 22 * 60) return false  // Friday after NY close (22:00 UTC)
  return true
}

function isUSStockOpen(now: Date): boolean {
  const day = now.getUTCDay()
  if (day === 0 || day === 6) return false
  const isEDT    = now.getUTCMonth() + 1 >= 3 && now.getUTCMonth() + 1 <= 11
  const openMins  = isEDT ? 13 * 60 + 30 : 14 * 60 + 30
  const closeMins = isEDT ? 20 * 60       : 21 * 60
  const mins      = now.getUTCHours() * 60 + now.getUTCMinutes()
  return mins >= openMins && mins < closeMins
}

function getMarketStatus(symbol: string, feedSource: string | null, now: Date): MarketStatus {
  if (feedSource === 'synthetic') return 'stale'
  const cls  = detectAssetClass(symbol)
  const open = cls === 'crypto' ? true : cls === 'forex' ? isForexOpen(now) : isUSStockOpen(now)
  if (feedSource === 'cache' && open) return 'stale'
  return open ? 'live' : 'closed'
}

function getSessionLabel(symbol: string, now: Date): string {
  const cls = detectAssetClass(symbol)
  if (cls === 'crypto') return 'Crypto — 24 / 7'
  if (cls === 'forex') return isForexOpen(now) ? 'Forex — open' : 'Forex — closed (weekend)'
  const isEDT = now.getUTCMonth() + 1 >= 3 && now.getUTCMonth() + 1 <= 11
  const tz    = isEDT ? 'EDT' : 'EST'
  if (isUSStockOpen(now)) return `NYSE/NASDAQ — open until 4:00 PM ${tz}`
  const day  = now.getUTCDay()
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes()
  const openMins = isEDT ? 13 * 60 + 30 : 14 * 60 + 30
  if (day >= 1 && day <= 5 && mins < openMins) return `NYSE/NASDAQ — opens 9:30 AM ${tz}`
  if (day === 5 || day === 6 || day === 0) return `NYSE/NASDAQ — opens Mon 9:30 AM ${tz}`
  return `NYSE/NASDAQ — opens tomorrow 9:30 AM ${tz}`
}

const STATUS_CONFIG: Record<MarketStatus, { label: string; dot: string; pill: string; pulse: boolean }> = {
  live:   { label: 'Live',   dot: 'bg-emerald-400', pill: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300', pulse: true  },
  closed: { label: 'Closed', dot: 'bg-slate-500',   pill: 'border-slate-600/40  bg-slate-500/10  text-slate-400',    pulse: false },
  stale:  { label: 'Stale',  dot: 'bg-amber-400',   pill: 'border-amber-400/25  bg-amber-500/10  text-amber-300',    pulse: false },
}

const STATUS_TOOLTIP: Record<MarketStatus, string> = {
  live:   'Market is open — streaming live data',
  closed: 'Market is currently closed — showing last available prices',
  stale:  'Showing cached or fallback data — live feed unavailable',
}

// ── Annotation colours ────────────────────────────────────────────────────────

const ANN_COLORS = [
  { hex: '#f87171', label: 'Red'   },
  { hex: '#34d399', label: 'Green' },
  { hex: '#fbbf24', label: 'Amber' },
  { hex: '#60a5fa', label: 'Blue'  },
]

export default function ChartPanel(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const feedMenuRef = useRef<HTMLDivElement>(null)
  const { chartRef, candleSeriesRef, volumeSeriesRef, rsiSeriesRef } = useChart(containerRef)
  const [feedPreference, setFeedPreference] = useState<CandleSourcePreference>(readFeedPreference)
  const [feedMenuOpen, setFeedMenuOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [atRefocused, setAtRefocused] = useState(false)
  const [now, setNow] = useState(() => new Date())

  // Re-evaluate market open/close every minute
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const symbol    = useChartStore(s => s.symbol)
  const interval  = useChartStore(s => s.interval) as Timeframe

  const disabledTfs = UNSUPPORTED_TFS[feedPreference] as Timeframe[] | undefined ?? []

  // Annotation state
  const annotateMenuRef   = useRef<HTMLDivElement>(null)
  const priceLineRefs     = useRef<Map<string, IPriceLine>>(new Map())
  const [drawingMode,     setDrawingMode]     = useState(false)
  const [annotateOpen,    setAnnotateOpen]    = useState(false)
  const [selectedColor,   setSelectedColor]   = useState(ANN_COLORS[0].hex)
  const { getFor, add: addAnnotation, remove: removeAnnotation, clear: clearAnnotations } = useAnnotationStore()
  const annotations = getFor(symbol)

  const getCandleTheme = useSettingsStore(s => s.getCandleTheme)
  const candleThemeId  = useSettingsStore(s => s.candleThemeId)
  const chartBgMode    = useSettingsStore(s => s.chartBgMode)
  const timezone       = useSettingsStore(s => s.timezone)

  // Re-apply timezone to chart time scale whenever it changes in settings
  useEffect(() => {
    chartRef.current?.applyOptions({
      timeScale: { tickMarkFormatter: makeTickMarkFormatter(timezone) },
    })
  }, [timezone])

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

  // Reset refocus guard when user interacts with the chart
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const reset = () => setAtRefocused(false)
    el.addEventListener('pointerdown', reset)
    el.addEventListener('wheel', reset, { passive: true })
    return () => {
      el.removeEventListener('pointerdown', reset)
      el.removeEventListener('wheel', reset)
    }
  }, [])

  const { loading, error, feedSource, feedHealth } = useCandles(
    symbol, interval, candleSeriesRef, volumeSeriesRef, chartRef, feedPreference, refreshKey,
    rsiSeriesRef,
  )

  const marketStatus: MarketStatus | null = feedSource !== null ? getMarketStatus(symbol, feedSource, now) : null
  const statusCfg = marketStatus ? STATUS_CONFIG[marketStatus] : null

  // When data reloads, the view resets so refocus guard clears
  useEffect(() => { setAtRefocused(false) }, [symbol, interval, refreshKey])

  // Sync annotation store → lightweight-charts price lines.
  // Runs when loading finishes (series is ready) or annotations change.
  useEffect(() => {
    if (loading) return
    const series = candleSeriesRef.current
    if (!series) return

    // Remove stale lines
    for (const [id, line] of priceLineRefs.current) {
      try { series.removePriceLine(line) } catch { /* ignore */ }
      priceLineRefs.current.delete(id)
    }

    // Add current annotations
    for (const ann of annotations) {
      const line = series.createPriceLine({
        price:             ann.price,
        color:             ann.color,
        lineWidth:         1,
        lineStyle:         2, // Dashed
        axisLabelVisible:  true,
        title:             ann.label || '',
      })
      priceLineRefs.current.set(ann.id, line)
    }
  }, [loading, symbol, annotations])

  // Subscribe chart click → place annotation when in drawing mode
  const drawingModeRef    = useRef(drawingMode)
  const selectedColorRef  = useRef(selectedColor)
  drawingModeRef.current   = drawingMode
  selectedColorRef.current = selectedColor

  const handleChartClick = useCallback((params: { point?: { x: number; y: number }; sourceEvent?: { clientY: number } }) => {
    if (!drawingModeRef.current || !candleSeriesRef.current) return
    // Use point.y from chart params; if coordinateToPrice returns null (clicked RSI/volume pane),
    // fall back to the crosshair price if available
    const y = params.point?.y
    if (y == null) return
    let price = candleSeriesRef.current.coordinateToPrice(y)
    // If y is outside the main price pane, try nearby y values within ±8px
    if (price === null) {
      for (let delta = 1; delta <= 8; delta++) {
        price = candleSeriesRef.current.coordinateToPrice(y - delta)
        if (price !== null) break
        price = candleSeriesRef.current.coordinateToPrice(y + delta)
        if (price !== null) break
      }
    }
    if (price === null) return
    addAnnotation(symbol, { price, color: selectedColorRef.current, label: '' })
  }, [symbol, addAnnotation])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chart.subscribeClick(handleChartClick as any)
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chart.unsubscribeClick(handleChartClick as any)
    }
  }, [handleChartClick])

  // Close annotate dropdown on outside click
  useEffect(() => {
    if (!annotateOpen) return
    const close = (e: PointerEvent) => {
      if (annotateMenuRef.current?.contains(e.target as Node)) return
      setAnnotateOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [annotateOpen])

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
    if (atRefocused) return
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
          () => setAtRefocused(true),
        )
      })
    })
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Toolbar — single row, no wrap */}
      <div className="flex items-center gap-3 px-4 py-2 bg-surface-base/50 backdrop-blur-sm border-b border-white/[0.06] shrink-0">
        <SymbolSearch />
        <div className="w-px h-4 bg-glass/60 shrink-0" />
        <TimeframePills disabledTfs={disabledTfs} />

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5">

          {/* Annotate dropdown */}
          <div ref={annotateMenuRef} className="relative">
            <button
              type="button"
              title={drawingMode ? 'Click chart to place a line · click here to exit' : 'Annotate chart'}
              onClick={() => { setAnnotateOpen(o => !o) }}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors ${
                drawingMode
                  ? 'border-blue-500/40 bg-blue-500/15 text-blue-300'
                  : 'border-glass bg-surface-2 text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]'
              }`}
            >
              {/* Pencil icon */}
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8.5 1.5a1.5 1.5 0 0 1 2 2L4 10H2v-2L8.5 1.5z"/>
              </svg>
              {annotations.length > 0 && (
                <span className="text-[9px] tabular-nums opacity-70">{annotations.length}</span>
              )}
            </button>

            {annotateOpen && (
              <div className="absolute right-0 top-full z-30 w-52 pt-2">
                <div className="rounded-xl border border-white/[0.08] bg-surface-base/80 p-2 shadow-xl backdrop-blur-xl flex flex-col gap-2">

                  {/* Draw mode toggle */}
                  <button
                    type="button"
                    onClick={() => setDrawingMode(m => !m)}
                    className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors ${
                      drawingMode
                        ? 'bg-blue-500/20 text-blue-200 border border-blue-500/30'
                        : 'text-slate-300 hover:bg-white/[0.06]'
                    }`}
                  >
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8.5 1.5a1.5 1.5 0 0 1 2 2L4 10H2v-2L8.5 1.5z"/>
                    </svg>
                    {drawingMode ? 'Drawing — click to place' : 'Draw horizontal line'}
                  </button>

                  {/* Color picker */}
                  <div className="flex items-center gap-1.5 px-1">
                    {ANN_COLORS.map(c => (
                      <button
                        key={c.hex}
                        title={c.label}
                        onClick={() => setSelectedColor(c.hex)}
                        style={{ background: c.hex }}
                        className={`w-4 h-4 rounded-full transition-transform ${
                          selectedColor === c.hex ? 'ring-2 ring-white/40 scale-110' : 'opacity-60 hover:opacity-100'
                        }`}
                      />
                    ))}
                    <span className="ml-1 text-[9px] text-slate-500">colour</span>
                  </div>

                  {/* Annotation list */}
                  {annotations.length > 0 && (
                    <div className="flex flex-col gap-0.5 max-h-36 overflow-y-auto">
                      <div className="flex items-center justify-between px-1 mb-0.5">
                        <span className="text-[9px] text-slate-500 uppercase tracking-wide">Lines</span>
                        <button
                          onClick={() => clearAnnotations(symbol)}
                          className="text-[9px] text-slate-500 hover:text-rose-400 transition-colors"
                        >
                          Clear all
                        </button>
                      </div>
                      {annotations.map(ann => (
                        <div key={ann.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-white/[0.04] group">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ann.color }} />
                          <span className="flex-1 text-[11px] text-slate-300 font-mono tabular-nums">
                            {ann.price >= 1000
                              ? ann.price.toFixed(2)
                              : ann.price < 10 ? ann.price.toFixed(5) : ann.price.toFixed(4)}
                          </span>
                          <button
                            onClick={() => removeAnnotation(symbol, ann.id)}
                            className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 transition-all text-sm leading-none"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {annotations.length === 0 && !drawingMode && (
                    <p className="px-1 text-[9px] text-slate-600 leading-snug">
                      Enable drawing, then click the chart to mark support and resistance levels.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Status pill — market open/closed + data feed combined */}
          <div ref={feedMenuRef} className="relative hidden sm:block">
            <button
              type="button"
              onClick={() => setFeedMenuOpen(open => !open)}
              title={marketStatus ? STATUS_TOOLTIP[marketStatus] : 'Market status'}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors ${
                statusCfg ? statusCfg.pill : 'border-glass bg-surface-2 text-slate-400'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                statusCfg ? statusCfg.dot : 'bg-slate-500'
              } ${(loading || (statusCfg?.pulse)) ? 'animate-pulse' : ''}`} />
              <span>{statusCfg ? statusCfg.label : 'Loading'}</span>
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m3 5 3 3 3-3" />
              </svg>
            </button>

            {feedMenuOpen && (
              <div className="absolute right-0 top-full z-30 w-64 pt-2">
                <div className="rounded-xl border border-white/[0.08] bg-surface-base/80 p-1.5 shadow-xl backdrop-blur-xl">

                  {/* ── Market session row ── */}
                  <div className="px-2 pt-1 pb-2">
                    <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500 mb-1.5">Market</p>
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${statusCfg ? statusCfg.dot : 'bg-slate-500'} ${statusCfg?.pulse ? 'animate-pulse' : ''}`} />
                      <span className={`text-[11px] ${statusCfg ? statusCfg.pill.split(' ').find(c => c.startsWith('text-')) ?? 'text-slate-300' : 'text-slate-400'}`}>
                        {getSessionLabel(symbol, now)}
                      </span>
                    </div>
                    {marketStatus === 'stale' && (
                      <p className="mt-1 text-[9px] text-amber-400/70 leading-snug">
                        {feedSource === 'synthetic' ? 'All live APIs failed — showing synthesised fallback data.' : 'Using cached data — live feed may be rate-limited.'}
                      </p>
                    )}
                  </div>

                  <div className="mx-1.5 mb-1.5 border-t border-glass/50" />

                  {/* ── Data feed rows ── */}
                  <div className="flex items-center justify-between px-2 pb-1.5">
                    <span className="text-[9px] uppercase tracking-[0.12em] text-slate-500">Data feed</span>
                    <span className="text-[9px] text-slate-500">
                      {feedSource ? FEED_LABELS[feedSource] : 'Auto'}
                    </span>
                  </div>
                  {FEED_OPTIONS.map(option => {
                    const health = option.value === 'auto' ? null : feedHealth[option.value]
                    const statusLabel = !health
                      ? 'Fallback chain'
                      : health.status === 'ok'           ? 'Working'
                      : health.status === 'rate_limited' ? 'Rate limited'
                      : health.status === 'error'        ? 'Unavailable'
                      :                                    'Not checked'
                    const dotCls  = !health              ? 'bg-blue-300'
                      : health.status === 'ok'           ? 'bg-emerald-300'
                      : health.status === 'rate_limited' ? 'bg-amber-300'
                      : health.status === 'error'        ? 'bg-red-400'
                      :                                    'bg-slate-500'
                    const txtCls  = !health              ? 'text-blue-300'
                      : health.status === 'ok'           ? 'text-emerald-300'
                      : health.status === 'rate_limited' ? 'text-amber-300'
                      : health.status === 'error'        ? 'text-red-300'
                      :                                    'text-slate-500'
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
                        <span className={`h-2 w-2 rounded-full ${dotCls}`} />
                        <span className="flex-1">{option.label}</span>
                        <span className={`text-[9px] ${txtCls}`}>{statusLabel}</span>
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
                chart.priceScale('right').applyOptions({ autoScale: true })
                chart.timeScale().setVisibleLogicalRange({ from: center - half * 0.65, to: center + half * 0.65 })
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
                chart.priceScale('right').applyOptions({ autoScale: true })
                chart.timeScale().setVisibleLogicalRange({ from: center - half * 1.5, to: center + half * 1.5 })
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
            disabled={atRefocused}
            title={atRefocused ? 'Already at latest view' : 'Refocus latest candles'}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] transition-colors text-[10px] disabled:opacity-40 disabled:cursor-not-allowed"
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
          </div>{/* end tools inner div */}
        </div>
      </div>

      {/* Chart canvas + overlays */}
      <div className="relative flex-1 min-h-0">
        <div ref={containerRef} className={`absolute inset-0 ${drawingMode ? 'cursor-crosshair' : ''}`} />

        {/* Error state */}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-surface-1/80 backdrop-blur-sm border border-glass rounded-xl px-5 py-3 text-center">
              <p className="text-sm text-slate-300">Data unavailable.</p>
              <p className="text-xs text-slate-500 mt-0.5">Try refreshing or switching the data source.</p>
            </div>
          </div>
        )}

        {/* Indicator legend */}
        {!error && (
          <div className="absolute top-2 left-3 flex items-center gap-3 pointer-events-none">
            <span className="flex items-center gap-1 text-[9px] text-slate-500">
              <span className="w-4 h-px bg-violet-400/85 inline-block rounded" />
              RSI 14
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
