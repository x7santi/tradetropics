import { useEffect, useRef, useState, useCallback } from 'react'
import {
  createChart, CandlestickSeries, LineSeries, ColorType, CrosshairMode,
  createSeriesMarkers,
  type IChartApi, type ISeriesApi, type ISeriesMarkersPluginApi,
} from 'lightweight-charts'
import { LineChart, Line, ResponsiveContainer, Tooltip as RechartTooltip, ReferenceLine } from 'recharts'
import Layout from '@renderer/components/Layout'
import SymbolSearch from '@renderer/components/chart/SymbolSearch'
import { useChartStore } from '@renderer/store/chartStore'
import { useSettingsStore, BG_COLORS } from '@renderer/store/settingsStore'
import { fetchCandles, type Candle } from '@renderer/lib/finnhub'
import { backtestEMACross, backtestRSI, type BacktestResult } from '@renderer/lib/backtest'
import { computeEMASeries } from '@renderer/lib/confidence'

// ── Types & constants ─────────────────────────────────────────────────────────

type Strategy = 'ema' | 'rsi'
type PlaySpeed = 1 | 5 | 20

interface Preset {
  label: string
  description: string
  strategy: Strategy
  fast?: number; slow?: number
  period?: number; oversold?: number; overbought?: number
}

const PRESETS: Preset[] = [
  { label: 'EMA 9/21',   description: 'Short-term momentum', strategy: 'ema', fast: 9,  slow: 21  },
  { label: 'EMA 20/50',  description: 'Swing trading',       strategy: 'ema', fast: 20, slow: 50  },
  { label: 'EMA 50/200', description: 'Long-term trend',     strategy: 'ema', fast: 50, slow: 200 },
  { label: 'RSI 30/70',  description: 'Standard reversal',   strategy: 'rsi', period: 14, oversold: 30, overbought: 70 },
  { label: 'RSI 40/60',  description: 'Tight reversal',      strategy: 'rsi', period: 14, oversold: 40, overbought: 60 },
]

const SPEED_MS: Record<PlaySpeed, number> = { 1: 120, 5: 25, 20: 6 }

// Timeframe config for the backtest
type BtTf = '1m' | '5m' | '15m' | '30m' | '1H' | '4H' | '1D'
const BT_TF_OPTIONS: BtTf[] = ['1m', '5m', '15m', '30m', '1H', '4H', '1D']
const BT_TD_INTERVAL: Record<BtTf, string> = {
  '1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min',
  '1H': '1h', '4H': '4h', '1D': '1day',
}
const BT_BAR_COUNT: Record<BtTf, number> = {
  '1m': 500, '5m': 500, '15m': 500, '30m': 500,
  '1H': 500, '4H': 500, '1D': 1512,
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Stat({ label, value, sub, positive }: { label: string; value: string; sub?: string; positive?: boolean | null }) {
  const valColor = positive === true ? 'text-emerald-400' : positive === false ? 'text-red-400' : 'text-slate-100'
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[9px] uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`text-lg font-semibold tabular-nums leading-none ${valColor}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 tabular-nums">{sub}</p>}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BacktestPage(): JSX.Element {
  const containerRef   = useRef<HTMLDivElement>(null)
  const chartRef       = useRef<IChartApi | null>(null)
  const candleRef      = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const emaRef         = useRef<ISeriesApi<'Line'> | null>(null)
  const markersRef     = useRef<ISeriesMarkersPluginApi<number> | null>(null)

  const symbol         = useChartStore(s => s.symbol)
  const getCandleTheme = useSettingsStore(s => s.getCandleTheme)
  const chartBgMode    = useSettingsStore(s => s.chartBgMode)

  // ── Timeframe state ───────────────────────────────────────────────────────────
  const [btTimeframe, setBtTimeframe] = useState<BtTf>('1D')

  // ── Strategy state (mirrored to refs for stable runBacktest) ─────────────────
  const [advancedMode, setAdvancedMode] = useState(false)
  const [activePreset, setActivePreset] = useState(0)
  const [strategy,     setStrategy]     = useState<Strategy>('ema')
  const [fastPeriod,   setFastPeriod]   = useState(9)
  const [slowPeriod,   setSlowPeriod]   = useState(21)
  const [rsiPeriod,    setRsiPeriod]    = useState(14)
  const [oversold,     setOversold]     = useState(30)
  const [overbought,   setOverbought]   = useState(70)

  // Refs always hold latest param values — lets runBacktest be stable ([] deps)
  const strategyRef    = useRef(strategy)
  const fastRef        = useRef(fastPeriod)
  const slowRef        = useRef(slowPeriod)
  const rsiRef         = useRef(rsiPeriod)
  const oversoldRef    = useRef(oversold)
  const overboughtRef  = useRef(overbought)
  strategyRef.current   = strategy
  fastRef.current       = fastPeriod
  slowRef.current       = slowPeriod
  rsiRef.current        = rsiPeriod
  oversoldRef.current   = oversold
  overboughtRef.current = overbought

  // ── Data / result state ──────────────────────────────────────────────────────
  const [candles,      setCandles]      = useState<Candle[]>([])
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [result,       setResult]       = useState<BacktestResult | null>(null)
  const [lastRunAt,    setLastRunAt]    = useState<Date | null>(null)

  // ── Replay state ─────────────────────────────────────────────────────────────
  const [replayBar,    setReplayBar]    = useState(0)
  const [isPlaying,    setIsPlaying]    = useState(false)
  const [playSpeed,    setPlaySpeed]    = useState<PlaySpeed>(5)

  // Mutable refs for cross-effect access
  const abortRef      = useRef<AbortController | null>(null)
  const playTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const emaFullRef    = useRef<(number | null)[]>([])
  const candlesRef    = useRef<Candle[]>([])
  const resultRef     = useRef<BacktestResult | null>(null)
  candlesRef.current  = candles
  resultRef.current   = result

  // ── Init chart ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const theme  = getCandleTheme()
    const bgCols = BG_COLORS[chartBgMode]

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: bgCols.bg },
        textColor: bgCols.text,
      },
      grid: { vertLines: { color: bgCols.grid }, horzLines: { color: bgCols.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: {
        borderColor: bgCols.border,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: number, tickMarkType: number) => {
          const d = new Date(time * 1000)
          if (tickMarkType === 0) return d.getFullYear().toString()
          if (tickMarkType === 1) return d.toLocaleString('default', { month: 'short' })
          if (tickMarkType === 2) return `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`
          const h = d.getHours().toString().padStart(2, '0')
          const m = d.getMinutes().toString().padStart(2, '0')
          return `${h}:${m}`
        },
      },
      rightPriceScale: { borderColor: bgCols.border },
    })

    const cs = chart.addSeries(CandlestickSeries, {
      upColor: theme.upColor, downColor: theme.downColor,
      borderVisible: theme.borderVisible ?? false,
      borderUpColor: theme.borderUpColor, borderDownColor: theme.borderDownColor,
      wickUpColor: theme.wickUpColor, wickDownColor: theme.wickDownColor,
    })

    const es = chart.addSeries(LineSeries, {
      color: 'rgba(96,165,250,0.75)', lineWidth: 1,
      priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
    })

    chartRef.current    = chart
    candleRef.current   = cs
    emaRef.current      = es
    markersRef.current  = createSeriesMarkers(cs, []) as ISeriesMarkersPluginApi<number>

    return () => {
      chart.remove()
      chartRef.current   = null
      candleRef.current  = null
      emaRef.current     = null
      markersRef.current = null
    }
  }, []) // stable on mount

  // ── Load candles ─────────────────────────────────────────────────────────────
  useEffect(() => {
    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort

    setLoading(true)
    setError(null)
    setResult(null)
    setIsPlaying(false)

    const tdInterval = BT_TD_INTERVAL[btTimeframe]
    const barCount   = BT_BAR_COUNT[btTimeframe]

    fetchCandles(symbol, barCount, tdInterval, abort.signal, { allowSyntheticOnCredit: false })
      .then(c => {
        if (abort.signal.aborted) return
        setCandles(c)
        setReplayBar(c.length - 1)

        const cs = candleRef.current
        if (!cs || !chartRef.current) return
        cs.setData(c.map(x => ({ time: x.time as number, open: x.open, high: x.high, low: x.low, close: x.close })))
        chartRef.current.timeScale().fitContent()
      })
      .catch(e => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Failed to load data') })
      .finally(() => { if (!abort.signal.aborted) setLoading(false) })
  }, [symbol, btTimeframe])

  // ── runBacktest: stable callback — reads all params from refs ────────────────
  const runBacktest = useCallback((
    strat?: Strategy,
    fast?: number,
    slow?: number,
    rsiP?: number,
    os?: number,
    ob?: number,
  ) => {
    const c  = candlesRef.current
    if (c.length < 30) return

    const s  = strat ?? strategyRef.current
    const f  = fast  ?? fastRef.current
    const sl = slow  ?? slowRef.current
    const rp = rsiP  ?? rsiRef.current
    const ov = os    ?? oversoldRef.current
    const ob2 = ob   ?? overboughtRef.current

    const res = s === 'ema'
      ? backtestEMACross(c, f, sl)
      : backtestRSI(c, rp, ov, ob2)

    setResult(res)
    setLastRunAt(new Date())

    // Pre-compute EMA overlay
    emaFullRef.current = s === 'ema' ? computeEMASeries(c, f) : []

    // Update EMA series on chart
    const es = emaRef.current
    if (es) {
      if (s === 'ema' && emaFullRef.current.length > 0) {
        es.setData(
          c.map((x, i) => emaFullRef.current[i] !== null
            ? { time: x.time as number, value: emaFullRef.current[i]! }
            : null
          ).filter((x): x is { time: number; value: number } => x !== null)
        )
      } else {
        es.setData([])
      }
    }

    // Place all markers (entry = green arrow up, exit = colored arrow down)
    const allMarkers = res.trades.flatMap(t => [
      {
        time: c[t.entryBar].time as number,
        position: 'belowBar' as const,
        color: '#34d399',
        shape: 'arrowUp' as const,
        text: 'Buy',
        size: 1,
      },
      {
        time: c[t.exitBar].time as number,
        position: 'aboveBar' as const,
        color: t.pnlPct >= 0 ? '#34d399' : '#f87171',
        shape: 'arrowDown' as const,
        text: `${t.pnlPct >= 0 ? '+' : ''}${t.pnlPct.toFixed(1)}%`,
        size: 1,
      },
    ]).sort((a, b) => a.time - b.time)

    markersRef.current?.setMarkers(allMarkers)

    // Reset to full view
    setReplayBar(c.length - 1)
    chartRef.current?.timeScale().fitContent()
  }, []) // stable — reads all mutable state from refs

  // Auto-run when candles first load (stable runBacktest is safe to include)
  useEffect(() => {
    if (candles.length >= 30) runBacktest()
  }, [candles, runBacktest])

  // ── Apply preset ──────────────────────────────────────────────────────────────
  function applyPreset(idx: number) {
    const p = PRESETS[idx]
    setActivePreset(idx)
    setStrategy(p.strategy)
    if (p.strategy === 'ema' && p.fast && p.slow) {
      setFastPeriod(p.fast)
      setSlowPeriod(p.slow)
      // Update refs immediately so runBacktest reads fresh values
      strategyRef.current = 'ema'
      fastRef.current     = p.fast
      slowRef.current     = p.slow
      runBacktest('ema', p.fast, p.slow)
    } else if (p.strategy === 'rsi' && p.period) {
      const os2 = p.oversold ?? 30
      const ob2 = p.overbought ?? 70
      setRsiPeriod(p.period)
      setOversold(os2)
      setOverbought(ob2)
      strategyRef.current    = 'rsi'
      rsiRef.current         = p.period
      oversoldRef.current    = os2
      overboughtRef.current  = ob2
      runBacktest('rsi', undefined, undefined, p.period, os2, ob2)
    }
  }

  // ── Replay: update chart to show only bars up to replayBar ───────────────────
  const applyReplayBar = useCallback((bar: number) => {
    const c   = candlesRef.current
    const cs  = candleRef.current
    const es  = emaRef.current
    const res = resultRef.current
    if (!cs || c.length === 0) return

    const slice = c.slice(0, bar + 1)
    cs.setData(slice.map(x => ({ time: x.time as number, open: x.open, high: x.high, low: x.low, close: x.close })))

    if (es && emaFullRef.current.length > 0) {
      es.setData(
        slice.map((x, i) => emaFullRef.current[i] !== null
          ? { time: x.time as number, value: emaFullRef.current[i]! }
          : null
        ).filter((x): x is { time: number; value: number } => x !== null)
      )
    }

    if (res && markersRef.current) {
      const vis = res.trades.flatMap(t => {
        const ms: { time: number; position: 'belowBar' | 'aboveBar'; color: string; shape: 'arrowUp' | 'arrowDown'; text: string; size: number }[] = []
        if (t.entryBar <= bar) ms.push({ time: c[t.entryBar].time as number, position: 'belowBar', color: '#34d399', shape: 'arrowUp', text: 'Buy', size: 1 })
        if (t.exitBar  <= bar) ms.push({ time: c[t.exitBar].time  as number, position: 'aboveBar', color: t.pnlPct >= 0 ? '#34d399' : '#f87171', shape: 'arrowDown', text: `${t.pnlPct >= 0 ? '+' : ''}${t.pnlPct.toFixed(1)}%`, size: 1 })
        return ms
      }).sort((a, b) => a.time - b.time)
      markersRef.current.setMarkers(vis)
    }
  }, [])

  useEffect(() => {
    applyReplayBar(replayBar)
  }, [replayBar, applyReplayBar])

  // ── Play timer ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (playTimerRef.current) clearInterval(playTimerRef.current)
    if (!isPlaying) return
    playTimerRef.current = setInterval(() => {
      setReplayBar(b => {
        if (b >= candlesRef.current.length - 1) { setIsPlaying(false); return b }
        return b + 1
      })
    }, SPEED_MS[playSpeed])
    return () => { if (playTimerRef.current) clearInterval(playTimerRef.current) }
  }, [isPlaying, playSpeed])

  // ── Derived values ────────────────────────────────────────────────────────────
  const wins      = result?.trades.filter(t => t.pnlPct > 0).length ?? 0
  const losses    = (result?.trades.length ?? 0) - wins
  const returnPos = result ? result.totalReturn >= 0 : null

  const curveData = result
    ? (result.equityCurve.length > 300
        ? result.equityCurve.filter((_, i) => i % Math.ceil(result.equityCurve.length / 300) === 0)
        : result.equityCurve)
    : []

  const replayDate = candles[replayBar]
    ? new Date((candles[replayBar].time as number) * 1000).toLocaleDateString('default', { year: 'numeric', month: 'short', day: 'numeric' })
    : ''

  const isAtEnd = replayBar >= candles.length - 1

  const lastRunLabel = lastRunAt
    ? lastRunAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="flex flex-col flex-1 min-h-0">

        {/* ── Toolbar ── */}
        <div className="flex items-center gap-3 px-4 py-2 bg-surface-1 border-b border-glass shrink-0">
          <SymbolSearch />
          <div className="w-px h-4 bg-glass/60 shrink-0" />

          {/* Timeframe selector */}
          <div className="flex items-center gap-0.5 bg-surface-2 border border-glass rounded-md p-0.5">
            {BT_TF_OPTIONS.map(tf => (
              <button
                key={tf}
                onClick={() => setBtTimeframe(tf)}
                disabled={loading}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all disabled:opacity-40 ${
                  btTimeframe === tf
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-glass/60 shrink-0" />
          <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
            Backtester · {BT_BAR_COUNT[btTimeframe]} bars
          </span>

          <div className="ml-auto flex items-center gap-2">
            {loading && (
              <span className="text-[10px] text-slate-500 flex items-center gap-1.5">
                <span className="w-3 h-3 border border-slate-500 border-t-slate-300 rounded-full animate-spin" />
                Loading {symbol}…
              </span>
            )}
            {error && <span className="text-[10px] text-red-400 max-w-48 truncate">{error}</span>}
            {lastRunLabel && !loading && (
              <span className="text-[9px] text-slate-600 tabular-nums">run {lastRunLabel}</span>
            )}

            {/* Zoom in */}
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
                  <circle cx="5" cy="5" r="4"/><path d="M8.5 8.5 11 11M5 3v4M3 5h4"/>
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
                  <circle cx="5" cy="5" r="4"/><path d="M8.5 8.5 11 11M3 5h4"/>
                </svg>
              </button>
            </div>

            {/* Fit all */}
            <button
              onClick={() => {
                const chart = chartRef.current
                if (!chart) return
                chart.priceScale('right').applyOptions({ autoScale: true })
                chart.timeScale().fitContent()
              }}
              title="Fit all bars"
              className="flex items-center justify-center w-6 h-6 rounded-md border border-glass text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 6a5 5 0 1 0 5-5 5 5 0 0 0-3.5 1.4L1 1"/><path d="M1 1v3h3"/>
              </svg>
            </button>

            <button
              onClick={() => advancedMode ? runBacktest() : applyPreset(activePreset)}
              disabled={loading || candles.length < 30}
              className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-medium bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/25 disabled:opacity-40 transition-colors"
            >
              <svg width="9" height="9" viewBox="0 0 12 12" fill="currentColor"><path d="M3 2l8 4-8 4V2z"/></svg>
              Run
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* ── Chart ── */}
          <div className="flex flex-col flex-1 min-w-0 min-h-0">
            <div ref={containerRef} className="flex-1 min-h-0" />

            {/* ── Replay scrubber ── */}
            <div className="shrink-0 border-t border-glass bg-surface-1 px-4 py-2.5">
              <div className="flex items-center gap-3">

                <button onClick={() => { setIsPlaying(false); setReplayBar(0) }} title="Back to start"
                  disabled={replayBar === 0}
                  className="text-slate-500 hover:text-slate-200 disabled:opacity-30 transition-colors"
                >
                  <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M2 2h1.5v8H2zM4.5 6 10 2v8L4.5 6z"/>
                  </svg>
                </button>

                <button
                  onClick={() => {
                    if (isAtEnd) { setReplayBar(0); setIsPlaying(true) }
                    else setIsPlaying(p => !p)
                  }}
                  title={isPlaying ? 'Pause' : 'Play'}
                  className="text-slate-300 hover:text-white transition-colors"
                >
                  {isPlaying ? (
                    <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor">
                      <rect x="2" y="2" width="3" height="8" rx="0.5"/><rect x="7" y="2" width="3" height="8" rx="0.5"/>
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor">
                      <path d="M3 2l7 4-7 4V2z"/>
                    </svg>
                  )}
                </button>

                <button onClick={() => { setIsPlaying(false); setReplayBar(candles.length - 1) }} title="Jump to end"
                  disabled={isAtEnd}
                  className="text-slate-500 hover:text-slate-200 disabled:opacity-30 transition-colors"
                >
                  <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M8.5 2H10v8H8.5zM7.5 6 2 2v8l5.5-4z"/>
                  </svg>
                </button>

                <div className="flex items-center gap-0.5 text-[9px]">
                  {([1, 5, 20] as PlaySpeed[]).map(s => (
                    <button key={s} onClick={() => setPlaySpeed(s)}
                      className={`px-1.5 py-0.5 rounded transition-colors ${
                        playSpeed === s ? 'text-indigo-300 bg-indigo-500/15' : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >{s}×</button>
                  ))}
                </div>

                <input
                  type="range" min={0} max={Math.max(0, candles.length - 1)} value={replayBar}
                  onChange={e => { setIsPlaying(false); setReplayBar(+e.target.value) }}
                  className="flex-1 accent-indigo-500"
                />

                <span className="text-[10px] text-slate-400 tabular-nums w-36 text-right shrink-0">
                  {replayDate || '—'}
                  <span className="text-slate-600 ml-1">({replayBar + 1}/{candles.length})</span>
                </span>
              </div>
            </div>
          </div>

          {/* ── Results sidebar ── */}
          <div className="w-72 shrink-0 border-l border-glass flex flex-col overflow-y-auto bg-surface-1/50">

            {/* Strategy selector */}
            <div className="p-3 border-b border-glass/60">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] text-slate-500 uppercase tracking-widest">Strategy</span>
                <div className="flex items-center gap-0.5 bg-surface-2 border border-glass rounded p-0.5">
                  {(['Simple', 'Advanced'] as const).map(m => {
                    const isAdv = m === 'Advanced'
                    return (
                      <button key={m} onClick={() => setAdvancedMode(isAdv)}
                        className={`px-2 py-0.5 rounded text-[9px] font-medium transition-all ${
                          advancedMode === isAdv
                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >{m}</button>
                    )
                  })}
                </div>
              </div>

              {!advancedMode ? (
                <div className="flex flex-col gap-0.5">
                  {PRESETS.map((p, i) => (
                    <button key={p.label} onClick={() => applyPreset(i)}
                      className={`flex items-center justify-between w-full px-2.5 py-2 rounded-md text-left text-[11px] transition-colors ${
                        activePreset === i
                          ? 'bg-indigo-500/15 text-indigo-200 border border-indigo-500/20'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                      }`}
                    >
                      <span className="font-medium">{p.label}</span>
                      <span className="text-[9px] text-slate-500">{p.description}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-2 text-[10px] text-slate-400">
                  <div className="flex gap-0.5">
                    {(['ema', 'rsi'] as Strategy[]).map(s => (
                      <button key={s} onClick={() => setStrategy(s)}
                        className={`flex-1 py-1 rounded text-[10px] font-medium transition-all border ${
                          strategy === s
                            ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                            : 'text-slate-500 border-glass hover:text-slate-300'
                        }`}
                      >{s === 'ema' ? 'EMA Cross' : 'RSI Reversal'}</button>
                    ))}
                  </div>

                  {strategy === 'ema' ? (
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center justify-between">
                        Fast period
                        <input type="number" min={2} max={50} value={fastPeriod}
                          onChange={e => setFastPeriod(+e.target.value)}
                          className="w-16 bg-surface-2 border border-glass rounded px-2 py-0.5 text-slate-200 text-center focus:outline-none focus:border-indigo-500/40 text-[10px]"
                        />
                      </label>
                      <label className="flex items-center justify-between">
                        Slow period
                        <input type="number" min={3} max={200} value={slowPeriod}
                          onChange={e => setSlowPeriod(+e.target.value)}
                          className="w-16 bg-surface-2 border border-glass rounded px-2 py-0.5 text-slate-200 text-center focus:outline-none focus:border-indigo-500/40 text-[10px]"
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center justify-between">
                        RSI period
                        <input type="number" min={2} max={50} value={rsiPeriod}
                          onChange={e => setRsiPeriod(+e.target.value)}
                          className="w-16 bg-surface-2 border border-glass rounded px-2 py-0.5 text-slate-200 text-center focus:outline-none focus:border-indigo-500/40 text-[10px]"
                        />
                      </label>
                      <label className="flex items-center justify-between">
                        Oversold
                        <input type="number" min={10} max={49} value={oversold}
                          onChange={e => setOversold(+e.target.value)}
                          className="w-16 bg-surface-2 border border-glass rounded px-2 py-0.5 text-slate-200 text-center focus:outline-none focus:border-indigo-500/40 text-[10px]"
                        />
                      </label>
                      <label className="flex items-center justify-between">
                        Overbought
                        <input type="number" min={51} max={90} value={overbought}
                          onChange={e => setOverbought(+e.target.value)}
                          className="w-16 bg-surface-2 border border-glass rounded px-2 py-0.5 text-slate-200 text-center focus:outline-none focus:border-indigo-500/40 text-[10px]"
                        />
                      </label>
                    </div>
                  )}
                  <button
                    onClick={() => runBacktest()}
                    disabled={candles.length < 30}
                    className="w-full py-1.5 rounded text-[10px] font-medium bg-indigo-500/15 border border-indigo-500/25 text-indigo-300 hover:bg-indigo-500/25 disabled:opacity-40 transition-colors"
                  >
                    Run backtest
                  </button>
                </div>
              )}
            </div>

            {/* Stats */}
            {result && (
              <div className="p-3 border-b border-glass/60">
                <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-2.5">
                  Simulation · {result.strategyLabel}
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Stat
                    label="Total return"
                    value={`${result.totalReturn >= 0 ? '+' : ''}${result.totalReturn.toFixed(1)}%`}
                    positive={returnPos}
                  />
                  <Stat
                    label="Win rate"
                    value={`${result.winRate.toFixed(0)}%`}
                    positive={result.winRate >= 50}
                  />
                  <Stat
                    label="Simulated trades"
                    value={result.trades.length.toString()}
                    sub={`${wins}W / ${losses}L`}
                  />
                  <Stat
                    label="Max drawdown"
                    value={`−${result.maxDrawdown.toFixed(1)}%`}
                    positive={result.maxDrawdown < 15}
                  />
                </div>
                <p className="mt-2.5 text-[9px] text-slate-600 leading-snug">
                  Simulated algorithm trades on historical daily bars — not your personal journal trades.
                </p>
              </div>
            )}

            {/* Equity curve */}
            {result && curveData.length > 1 && (
              <div className="p-3 border-b border-glass/60">
                <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-2">Equity curve</p>
                <div className="h-28">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={curveData} margin={{ top: 2, right: 4, bottom: 2, left: 4 }}>
                      <ReferenceLine y={0} stroke="rgba(148,163,184,0.15)" strokeDasharray="3 3" />
                      <RechartTooltip
                        contentStyle={{
                          background: 'rgba(15,23,42,0.92)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 6, fontSize: 10, color: '#cbd5e1', padding: '3px 7px',
                        }}
                        formatter={(v: number) => [`${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, 'Equity']}
                        labelFormatter={() => ''}
                      />
                      <Line
                        type="monotone" dataKey="equity" dot={false} strokeWidth={1.5}
                        stroke={result.totalReturn >= 0 ? '#34d399' : '#f87171'}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Trade log */}
            {result && result.trades.length > 0 && (
              <div className="flex-1 overflow-y-auto p-3">
                <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-2">
                  Trade log ({result.trades.length} simulated)
                </p>
                <div className="flex flex-col gap-0.5">
                  {result.trades.map((t, i) => {
                    const entryDate = candles[t.entryBar]
                      ? new Date((candles[t.entryBar].time as number) * 1000).toLocaleDateString('default', { month: 'short', day: 'numeric', year: '2-digit' })
                      : '—'
                    const exitDate = candles[t.exitBar]
                      ? new Date((candles[t.exitBar].time as number) * 1000).toLocaleDateString('default', { month: 'short', day: 'numeric', year: '2-digit' })
                      : '—'
                    const win = t.pnlPct >= 0
                    return (
                      <div key={i} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-white/[0.03]">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${win ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] text-slate-500 tabular-nums">{entryDate} → {exitDate}</p>
                          <p className="text-[10px] text-slate-400 tabular-nums">
                            {t.entryPrice >= 100 ? t.entryPrice.toFixed(2) : t.entryPrice.toFixed(4)} → {t.exitPrice >= 100 ? t.exitPrice.toFixed(2) : t.exitPrice.toFixed(4)}
                          </p>
                        </div>
                        <span className={`text-[11px] font-semibold tabular-nums ${win ? 'text-emerald-400' : 'text-red-400'}`}>
                          {win ? '+' : ''}{t.pnlPct.toFixed(1)}%
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {!result && !loading && !error && (
              <div className="flex-1 flex items-center justify-center p-6 text-center">
                <div>
                  <p className="text-slate-500 text-sm">No results yet</p>
                  <p className="text-slate-600 text-xs mt-1">Select a strategy and click Run</p>
                </div>
              </div>
            )}

            {loading && (
              <div className="flex-1 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-indigo-400/40 border-t-indigo-400 rounded-full animate-spin" />
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
