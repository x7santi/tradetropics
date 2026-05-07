import { useMemo, useState } from 'react'
import { useReportStore, REPORTS_PER_DAY } from '@renderer/store/reportStore'
import { playPaperScrunch } from '@renderer/lib/sounds'
import { computeRSISeries, computeEMASeries } from '@renderer/lib/confidence'
import type { Candle } from '@renderer/lib/finnhub'
import type { EntryScoreResult, CalendarEvent } from '@renderer/lib/confidence'

// ── Chart geometry ────────────────────────────────────────────────────────────
const CW = 360
const PH = 162  // price chart height
const VH = 22   // volume bar max height (inside PH)
const GAP = 7
const RY  = PH + GAP
const RH  = 58
const CH  = RY + RH  // total SVG height

// ── Helpers ───────────────────────────────────────────────────────────────────
function scoreColor(s: number): string {
  return `hsl(${s * 1.2}, 88%, 56%)`
}

function labelColor(s: number): string {
  if (s >= 80) return 'text-emerald-400'
  if (s >= 65) return 'text-blue-400'
  if (s >= 45) return 'text-yellow-400'
  if (s >= 25) return 'text-orange-400'
  return 'text-red-400'
}

function priceFormat(p: number): string {
  if (p >= 1000) return p.toFixed(1)
  if (p >= 10)   return p.toFixed(3)
  return p.toFixed(5)
}

function minsAgo(ts: number): string {
  const m = Math.round((Date.now() - ts) / 60_000)
  return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`
}

function minsUntil(ts: number): string {
  const m = Math.round((ts - Date.now()) / 60_000)
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
}

// ── SVG Candle Chart ──────────────────────────────────────────────────────────
function CandleChart({ candles, rsiSeries, emaSeries, support, resistance, currentPrice }: {
  candles:      Candle[]
  rsiSeries:    (number | null)[]
  emaSeries:    (number | null)[]
  support:      number | null
  resistance:   number | null
  currentPrice: number | null
}): JSX.Element {
  const N = Math.min(40, candles.length)
  if (N < 3) {
    return (
      <div className="flex items-center justify-center bg-surface-base/60 rounded-lg" style={{ height: CH }}>
        <p className="text-slate-400 text-xs">Insufficient candle data for chart</p>
      </div>
    )
  }

  const display  = candles.slice(-N)
  const startIdx = candles.length - N
  const cw       = CW / N

  const lo  = Math.min(...display.map(c => c.low))
  const hi  = Math.max(...display.map(c => c.high))
  const pad = (hi - lo) * 0.10
  const yLo = lo - pad
  const yHi = hi + pad
  const ySpan = yHi - yLo

  // Price chart uses top (PH - VH)px, volume uses bottom VH px
  const priceAreaH = PH - VH
  const py = (p: number) => VH + priceAreaH - ((p - yLo) / ySpan) * priceAreaH
  const volMax = Math.max(...display.map(c => c.volume || 0))
  const volH   = (v: number) => volMax > 0 ? (v / volMax) * (VH * 0.85) : 0
  const ry     = (rsi: number) => RY + RH - (rsi / 100) * RH

  // Build EMA path
  let emaPath = ''
  for (let i = 0; i < N; i++) {
    const v = emaSeries[startIdx + i]
    if (v === null || v < yLo || v > yHi) continue
    const x = (i + 0.5) * cw
    emaPath += (emaPath === '' ? 'M' : 'L') + `${x.toFixed(1)},${py(v).toFixed(1)}`
  }

  // Build RSI path
  let rsiPath = ''
  for (let i = 0; i < N; i++) {
    const v = rsiSeries[startIdx + i]
    if (v === null) continue
    const x = (i + 0.5) * cw
    rsiPath += (rsiPath === '' ? 'M' : 'L') + `${x.toFixed(1)},${ry(v).toFixed(1)}`
  }

  // Price grid labels (3 levels)
  const gridLevels = [0.2, 0.5, 0.8].map(t => yLo + ySpan * t)

  return (
    <svg width="100%" viewBox={`0 0 ${CW} ${CH}`} className="rounded-lg overflow-hidden block">

      {/* Backgrounds */}
      <rect x={0} y={0}  width={CW} height={PH} fill="rgba(6,13,26,0.92)" />
      <rect x={0} y={RY} width={CW} height={RH} fill="rgba(6,13,26,0.75)" />

      {/* Price grid */}
      {gridLevels.map((price, idx) => {
        const y = py(price)
        return (
          <g key={idx}>
            <line x1={0} y1={y} x2={CW} y2={y} stroke="rgba(148,163,184,0.055)" strokeWidth={1} />
            <text x={CW - 3} y={y - 2} textAnchor="end" fontSize={6.5} fill="rgba(148,163,184,0.3)" fontFamily="monospace">
              {priceFormat(price)}
            </text>
          </g>
        )
      })}

      {/* Support */}
      {support !== null && support >= yLo && support <= yHi && (
        <g>
          <line x1={0} y1={py(support)} x2={CW} y2={py(support)}
            stroke="rgba(52,211,153,0.5)" strokeWidth={0.9} strokeDasharray="5 3" />
          <text x={3} y={py(support) - 2} fontSize={6} fill="rgba(52,211,153,0.5)" fontFamily="monospace">S {priceFormat(support)}</text>
        </g>
      )}

      {/* Resistance */}
      {resistance !== null && resistance >= yLo && resistance <= yHi && (
        <g>
          <line x1={0} y1={py(resistance)} x2={CW} y2={py(resistance)}
            stroke="rgba(239,68,68,0.5)" strokeWidth={0.9} strokeDasharray="5 3" />
          <text x={3} y={py(resistance) - 2} fontSize={6} fill="rgba(239,68,68,0.5)" fontFamily="monospace">R {priceFormat(resistance)}</text>
        </g>
      )}

      {/* Current price dash */}
      {currentPrice !== null && currentPrice >= yLo && currentPrice <= yHi && (
        <line x1={0} y1={py(currentPrice)} x2={CW} y2={py(currentPrice)}
          stroke="rgba(148,163,184,0.18)" strokeWidth={0.8} strokeDasharray="2 4" />
      )}

      {/* Volume bars */}
      {display.map((c, i) => {
        const h = volH(c.volume || 0)
        const isG = c.close >= c.open
        return (
          <rect key={`vol${i}`}
            x={i * cw + cw * 0.08} y={PH - h}
            width={cw * 0.84} height={h}
            fill={isG ? 'rgba(52,211,153,0.13)' : 'rgba(239,68,68,0.10)'}
          />
        )
      })}

      {/* Candles */}
      {display.map((c, i) => {
        const isG = c.close >= c.open
        const col = isG ? '#34d399' : '#f87171'
        const cx  = (i + 0.5) * cw
        const bT  = Math.min(py(c.open), py(c.close))
        const bH  = Math.max(Math.abs(py(c.close) - py(c.open)), 1)
        return (
          <g key={`c${i}`}>
            <line x1={cx} y1={py(c.high)} x2={cx} y2={py(c.low)} stroke={col} strokeWidth={0.85} opacity={0.7} />
            <rect x={cx - cw * 0.36} y={bT} width={cw * 0.72} height={bH}
              fill={isG ? 'rgba(52,211,153,0.82)' : 'rgba(248,113,113,0.82)'} />
          </g>
        )
      })}

      {/* EMA 20 */}
      {emaPath && (
        <path d={emaPath} fill="none" stroke="#60a5fa" strokeWidth={1.2} opacity={0.75} />
      )}

      {/* Price / RSI divider */}
      <line x1={0} y1={PH + 2} x2={CW} y2={PH + 2} stroke="rgba(148,163,184,0.1)" strokeWidth={1} />

      {/* RSI 70/50/30 levels */}
      <rect x={0} y={ry(70)} width={CW} height={ry(30) - ry(70)} fill="rgba(148,163,184,0.02)" />
      <line x1={0} y1={ry(70)} x2={CW} y2={ry(70)} stroke="rgba(248,113,113,0.22)" strokeWidth={0.8} strokeDasharray="3 3" />
      <line x1={0} y1={ry(50)} x2={CW} y2={ry(50)} stroke="rgba(148,163,184,0.08)" strokeWidth={0.8} />
      <line x1={0} y1={ry(30)} x2={CW} y2={ry(30)} stroke="rgba(52,211,153,0.22)" strokeWidth={0.8} strokeDasharray="3 3" />
      <text x={3} y={ry(70) - 1.5} fontSize={5.5} fill="rgba(248,113,113,0.38)" fontFamily="monospace">70</text>
      <text x={3} y={ry(30) - 1.5} fontSize={5.5} fill="rgba(52,211,153,0.38)" fontFamily="monospace">30</text>
      <text x={CW - 3} y={RY + 8}  fontSize={5.5} fill="rgba(148,163,184,0.28)" textAnchor="end" fontFamily="monospace">RSI 14</text>

      {/* RSI line */}
      {rsiPath && (
        <path d={rsiPath} fill="none" stroke="#a78bfa" strokeWidth={1.3} opacity={0.88} />
      )}

    </svg>
  )
}

// ── Score bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ label, value, colorClass }: { label: string; value: number; colorClass: string }): JSX.Element {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-16 text-[10px] text-slate-400 uppercase tracking-wide shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colorClass} transition-all duration-700`} style={{ width: `${value}%` }} />
      </div>
      <span className="w-6 text-right text-xs tabular-nums font-mono"
        style={{ color: value >= 70 ? '#34d399' : value >= 45 ? '#fbbf24' : '#f87171' }}>
        {value}
      </span>
    </div>
  )
}

function AnalysisSection({ text }: { text: string }): JSX.Element {
  const [title, ...bodyParts] = text.split('::')
  const body = bodyParts.join('::') || text

  if (bodyParts.length === 0) {
    return <p className="text-sm text-slate-300 leading-relaxed">{text}</p>
  }

  return (
    <div className="rounded-lg border border-glass bg-surface-2/45 px-3 py-2.5">
      <p className="text-[10px] text-blue-300/80 uppercase tracking-widest mb-1.5 font-semibold">{title}</p>
      <p className="text-sm text-slate-300 leading-relaxed">{body}</p>
    </div>
  )
}

// ── News row ──────────────────────────────────────────────────────────────────
function NewsRow({ event, timeLabel, urgent }: { event: CalendarEvent; timeLabel: string; urgent?: boolean }): JSX.Element {
  return (
    <div className="flex items-center justify-between py-2 border-t border-glass/50">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-300 truncate">{event.title}</p>
        <p className="text-[10px] text-slate-400">{event.country} · High Impact</p>
      </div>
      <span className={`shrink-0 text-xs font-medium ml-3 ${urgent ? 'text-orange-400' : 'text-slate-400'}`}>
        {timeLabel}
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AnalysisReport(): JSX.Element {
  const isOpen       = useReportStore(s => s.isOpen)
  const closeReport  = useReportStore(s => s.closeReport)
  const latestReport = useReportStore(s => s.latestReport)
  const deleteReport = useReportStore(s => s.deleteReport)
  const remaining    = useReportStore(s => s.remainingReports())

  const [confirmDelete, setConfirmDelete] = useState(false)

  const candles  = latestReport?.candles  ?? []
  const analysis = latestReport?.analysis ?? null

  const rsiSeries = useMemo(() => computeRSISeries(candles), [candles])
  const emaSeries = useMemo(() => computeEMASeries(candles, 20), [candles])

  const handleDelete = () => {
    if (!latestReport) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
      return
    }
    playPaperScrunch()
    deleteReport(latestReport.id)
    setConfirmDelete(false)
  }

  return (
    <div
      className="fixed left-14 lg:left-48 right-0 bottom-0 z-50 flex flex-col bg-surface-1 border-t border-l border-glass overflow-hidden shadow-glass transition-transform duration-300 ease-out"
      style={{ height: '82%', transform: isOpen ? 'translateY(0)' : 'translateY(100%)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-glass shrink-0">
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest">Analysis Report</p>
          <p className="text-slate-100 text-base font-semibold mt-0.5">
            {latestReport?.symbol ?? '—'}
            <span className="text-slate-400 font-normal ml-1.5">{latestReport?.interval ?? ''}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 tabular-nums">
            {remaining}/{REPORTS_PER_DAY} left
          </span>

          {/* Delete with two-click confirm */}
          {latestReport && (
            <button
              onClick={handleDelete}
              title={confirmDelete ? 'Click again to confirm delete' : 'Delete this report'}
              className={`w-6 h-6 flex items-center justify-center rounded-md text-[10px] font-medium border transition-all duration-150 shrink-0
                ${confirmDelete
                  ? 'bg-red-500/15 border-red-500/35 text-red-400 w-auto px-2'
                  : 'bg-surface-3 border-glass text-slate-400 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/8'
                }`}
            >
              {confirmDelete ? (
                'Delete?'
              ) : (
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                  <path d="M2 4h10M5 4V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4M6 7v3.5M8 7v3.5M3 4l.8 7.5A.5.5 0 0 0 4.3 12h5.4a.5.5 0 0 0 .5-.5L11 4"/>
                </svg>
              )}
            </button>
          )}

          <button
            onClick={() => { closeReport(); setConfirmDelete(false) }}
            className="w-6 h-6 rounded bg-surface-3 hover:bg-surface-2 border border-glass flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors text-base leading-none"
          >
            ×
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {!latestReport || !analysis ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-slate-400 text-xs">No report generated yet.</p>
          </div>
        ) : (
          <div className="px-5 py-4 flex flex-col gap-5">

            {/* Meta row */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Generated {new Date(latestReport.generatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Score</span>
                <span className="text-2xl font-bold tabular-nums" style={{ color: scoreColor(analysis.score) }}>
                  {analysis.score}
                </span>
                <span className={`text-sm font-semibold ${labelColor(analysis.score)}`}>{analysis.label}</span>
              </div>
            </div>

            {/* Chart */}
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-2">Price · EMA 20 · RSI 14</p>
              <CandleChart
                candles={candles}
                rsiSeries={rsiSeries}
                emaSeries={emaSeries}
                support={analysis.support}
                resistance={analysis.resistance}
                currentPrice={analysis.currentPrice}
              />
              {/* Legend */}
              <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-px bg-blue-400 inline-block rounded" />EMA 20
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-px bg-violet-400 inline-block rounded" />RSI 14
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-px border-t border-dashed border-emerald-400/50 inline-block" />Support
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-px border-t border-dashed border-red-400/50 inline-block" />Resistance
                </span>
              </div>
            </div>

            {/* Indicator tiles */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-surface-2/60 border border-glass rounded-xl p-2.5 text-center">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">RSI 14</p>
                <p className={`text-base font-bold tabular-nums ${
                  analysis.rsi === null ? 'text-slate-400' :
                  analysis.rsi > 70 ? 'text-red-400' :
                  analysis.rsi < 30 ? 'text-emerald-400' : 'text-slate-200'}`}>
                  {analysis.rsi ?? '—'}
                </p>
              </div>
              <div className="bg-surface-2/60 border border-glass rounded-xl p-2.5 text-center">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">ATR</p>
                <p className="text-base font-bold tabular-nums text-slate-200">
                  {analysis.atr !== null ? (analysis.atr * 10000).toFixed(1) : '—'}
                </p>
              </div>
            </div>

            {/* Score breakdown */}
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-2.5">Confidence Breakdown</p>
              <div className="flex flex-col gap-2.5">
                <ScoreBar label="Direction" value={analysis.components.trendScore}      colorClass="bg-blue-500" />
                <ScoreBar label="Structure" value={analysis.components.volatilityScore} colorClass="bg-violet-500" />
                <ScoreBar label="Timing"    value={analysis.components.newsScore}       colorClass="bg-emerald-500" />
              </div>
            </div>

            {/* Deep analysis */}
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-2.5">Deep Analysis</p>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
                {analysis.deepAnalysis.map((para, i) => (
                  <AnalysisSection key={i} text={para} />
                ))}
              </div>
            </div>

            {/* Upcoming events */}
            {analysis.upcomingEvents.length > 0 && (
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Upcoming Events</p>
                {analysis.upcomingEvents.map((e, i) => {
                  const mins = Math.round((e.timestamp - Date.now()) / 60_000)
                  return <NewsRow key={i} event={e} timeLabel={minsUntil(e.timestamp)} urgent={mins < 30} />
                })}
              </div>
            )}

            {/* Recent events */}
            {analysis.recentEvents.length > 0 && (
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Recent Events</p>
                {analysis.recentEvents.map((e, i) => (
                  <NewsRow key={i} event={e} timeLabel={minsAgo(e.timestamp)} />
                ))}
              </div>
            )}

            <div className="h-2" />
          </div>
        )}
      </div>
    </div>
  )
}
