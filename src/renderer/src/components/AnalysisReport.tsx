import { useMemo, useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useReportStore, REPORTS_PER_DAY } from '@renderer/store/reportStore'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { useAuthStore } from '@renderer/store/authStore'
import { useTradesStore } from '@renderer/store/tradesStore'
import { playPaperScrunch } from '@renderer/lib/sounds'
import { computeRSISeries, computeEMASeries } from '@renderer/lib/confidence'
import type { Candle } from '@renderer/lib/finnhub'
import type { EntryScoreResult, CalendarEvent } from '@renderer/lib/confidence'

// ── Chart geometry (compact) ──────────────────────────────────────────────────
const CW = 360
const PH = 100
const VH = 13
const GAP = 4
const RY  = PH + GAP
const RH  = 36
const CH  = RY + RH

// ── Helpers ───────────────────────────────────────────────────────────────────
function scoreColor(s: number): string { return `hsl(${s * 1.2}, 88%, 56%)` }

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

function priceDec(p: number | null): number {
  if (p === null) return 5
  if (p >= 1000) return 2
  if (p >= 10)   return 3
  return 5
}

function minsAgo(ts: number): string {
  const m = Math.round((Date.now() - ts) / 60_000)
  return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`
}

function minsUntil(ts: number): string {
  const m = Math.round((ts - Date.now()) / 60_000)
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
}

// ── Derive trade setup from analysis data ─────────────────────────────────────
function deriveSetup(analysis: EntryScoreResult | null) {
  if (!analysis || analysis.direction === 'flat' || analysis.score < 40) return null
  if (!analysis.currentPrice || !analysis.atr) return null
  const { direction, support, resistance, currentPrice, atr } = analysis
  const dec = priceDec(currentPrice)
  if (direction === 'up') {
    const entry = support ?? currentPrice
    const stop  = entry - atr * 0.75
    const sd    = entry - stop
    const tgt   = resistance && resistance > entry + sd * 2.5 ? resistance : entry + sd * 2.5
    return { side: 'long' as const, entry, stop, target: tgt, rr: ((tgt - entry) / sd).toFixed(1), dec }
  } else {
    const entry = resistance ?? currentPrice
    const stop  = entry + atr * 0.75
    const sd    = stop - entry
    const tgt   = support && support < entry - sd * 2.5 ? support : entry - sd * 2.5
    return { side: 'short' as const, entry, stop, target: tgt, rr: ((entry - tgt) / sd).toFixed(1), dec }
  }
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
  if (N < 3) return (
    <div className="flex items-center justify-center bg-surface-base/60 rounded-lg" style={{ height: CH }}>
      <p className="text-slate-500 text-[10px]">Not enough data</p>
    </div>
  )

  const display  = candles.slice(-N)
  const startIdx = candles.length - N
  const cw       = CW / N
  const lo = Math.min(...display.map(c => c.low))
  const hi = Math.max(...display.map(c => c.high))
  const pad = (hi - lo) * 0.10
  const yLo = lo - pad, yHi = hi + pad, ySpan = yHi - yLo
  const priceAreaH = PH - VH
  const py = (p: number) => VH + priceAreaH - ((p - yLo) / ySpan) * priceAreaH
  const volMax = Math.max(...display.map(c => c.volume || 0))
  const volH   = (v: number) => volMax > 0 ? (v / volMax) * (VH * 0.85) : 0
  const ry     = (rsi: number) => RY + RH - (rsi / 100) * RH

  let emaPath = ''
  for (let i = 0; i < N; i++) {
    const v = emaSeries[startIdx + i]
    if (v === null || v < yLo || v > yHi) continue
    emaPath += (emaPath === '' ? 'M' : 'L') + `${((i + 0.5) * cw).toFixed(1)},${py(v).toFixed(1)}`
  }
  let rsiPath = ''
  for (let i = 0; i < N; i++) {
    const v = rsiSeries[startIdx + i]
    if (v === null) continue
    rsiPath += (rsiPath === '' ? 'M' : 'L') + `${((i + 0.5) * cw).toFixed(1)},${ry(v).toFixed(1)}`
  }
  const gridLevels = [0.25, 0.5, 0.75].map(t => yLo + ySpan * t)

  return (
    <svg width="100%" viewBox={`0 0 ${CW} ${CH}`} className="rounded-lg overflow-hidden block">
      <rect x={0} y={0}  width={CW} height={PH} fill="rgba(6,13,26,0.95)" />
      <rect x={0} y={RY} width={CW} height={RH} fill="rgba(6,13,26,0.80)" />

      {gridLevels.map((price, idx) => {
        const y = py(price)
        return (
          <g key={idx}>
            <line x1={0} y1={y} x2={CW} y2={y} stroke="rgba(148,163,184,0.05)" strokeWidth={1} />
            <text x={CW - 3} y={y - 2} textAnchor="end" fontSize={6} fill="rgba(148,163,184,0.25)" fontFamily="monospace">
              {priceFormat(price)}
            </text>
          </g>
        )
      })}

      {support !== null && support >= yLo && support <= yHi && (
        <g>
          <line x1={0} y1={py(support)} x2={CW} y2={py(support)} stroke="rgba(52,211,153,0.45)" strokeWidth={0.8} strokeDasharray="4 3" />
          <text x={3} y={py(support) - 2} fontSize={5.5} fill="rgba(52,211,153,0.45)" fontFamily="monospace">S</text>
        </g>
      )}
      {resistance !== null && resistance >= yLo && resistance <= yHi && (
        <g>
          <line x1={0} y1={py(resistance)} x2={CW} y2={py(resistance)} stroke="rgba(239,68,68,0.45)" strokeWidth={0.8} strokeDasharray="4 3" />
          <text x={3} y={py(resistance) - 2} fontSize={5.5} fill="rgba(239,68,68,0.45)" fontFamily="monospace">R</text>
        </g>
      )}
      {currentPrice !== null && currentPrice >= yLo && currentPrice <= yHi && (
        <line x1={0} y1={py(currentPrice)} x2={CW} y2={py(currentPrice)} stroke="rgba(148,163,184,0.15)" strokeWidth={0.7} strokeDasharray="2 4" />
      )}

      {display.map((c, i) => {
        const h = volH(c.volume || 0)
        const isG = c.close >= c.open
        return <rect key={`v${i}`} x={i * cw + cw * 0.1} y={PH - h} width={cw * 0.8} height={h} fill={isG ? 'rgba(52,211,153,0.10)' : 'rgba(239,68,68,0.08)'} />
      })}

      {display.map((c, i) => {
        const isG = c.close >= c.open
        const col = isG ? '#34d399' : '#f87171'
        const cx  = (i + 0.5) * cw
        const bT  = Math.min(py(c.open), py(c.close))
        const bH  = Math.max(Math.abs(py(c.close) - py(c.open)), 0.8)
        return (
          <g key={`c${i}`}>
            <line x1={cx} y1={py(c.high)} x2={cx} y2={py(c.low)} stroke={col} strokeWidth={0.8} opacity={0.65} />
            <rect x={cx - cw * 0.34} y={bT} width={cw * 0.68} height={bH} fill={isG ? 'rgba(52,211,153,0.80)' : 'rgba(248,113,113,0.80)'} />
          </g>
        )
      })}

      {emaPath && <path d={emaPath} fill="none" stroke="#60a5fa" strokeWidth={1.1} opacity={0.7} />}

      <line x1={0} y1={PH + 1} x2={CW} y2={PH + 1} stroke="rgba(148,163,184,0.08)" strokeWidth={1} />
      <rect x={0} y={ry(70)} width={CW} height={ry(30) - ry(70)} fill="rgba(148,163,184,0.015)" />
      <line x1={0} y1={ry(70)} x2={CW} y2={ry(70)} stroke="rgba(248,113,113,0.18)" strokeWidth={0.7} strokeDasharray="3 3" />
      <line x1={0} y1={ry(50)} x2={CW} y2={ry(50)} stroke="rgba(148,163,184,0.06)" strokeWidth={0.7} />
      <line x1={0} y1={ry(30)} x2={CW} y2={ry(30)} stroke="rgba(52,211,153,0.18)" strokeWidth={0.7} strokeDasharray="3 3" />
      <text x={CW - 3} y={RY + 7} fontSize={5} fill="rgba(148,163,184,0.22)" textAnchor="end" fontFamily="monospace">RSI</text>
      {rsiPath && <path d={rsiPath} fill="none" stroke="#a78bfa" strokeWidth={1.2} opacity={0.85} />}
    </svg>
  )
}

// ── Score bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ label, value, colorClass }: { label: string; value: number; colorClass: string }): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-[10px] text-slate-500 shrink-0">{label}</span>
      <div className="flex-1 h-1 bg-surface-3 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colorClass} transition-all duration-700`} style={{ width: `${value}%` }} />
      </div>
      <span className="w-5 text-right text-[10px] tabular-nums font-mono text-slate-400">{value}</span>
    </div>
  )
}

// ── Analysis section (article style) ─────────────────────────────────────────
function AnalysisSection({ text }: { text: string }): JSX.Element {
  const colonIdx = text.indexOf('::')
  if (colonIdx === -1) return <p className="text-sm text-slate-300 leading-relaxed">{text}</p>
  const title = text.slice(0, colonIdx).trim()
  const body  = text.slice(colonIdx + 2).trim()
  return (
    <div className="border-b border-glass/30 pb-4 last:border-0 last:pb-0">
      <p className="text-[10px] text-blue-400/75 uppercase tracking-widest mb-1.5 font-semibold">{title}</p>
      <p className="text-sm text-slate-300 leading-relaxed">{body}</p>
    </div>
  )
}

// ── Signal strength bars ──────────────────────────────────────────────────────
function SignalBars({ score, direction }: { score: number; direction: string }): JSX.Element {
  const filled = score >= 80 ? 5 : score >= 65 ? 4 : score >= 45 ? 3 : score >= 25 ? 2 : 1
  const col    = direction === 'up' ? '#34d399' : direction === 'down' ? '#f87171' : '#94a3b8'
  return (
    <div className="flex items-end gap-[2px] mt-1">
      {[1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          style={{ width: 3, height: 4 + i * 2.5, borderRadius: 1.5, background: i <= filled ? col : 'rgba(148,163,184,0.12)' }}
        />
      ))}
    </div>
  )
}

// ── News row ──────────────────────────────────────────────────────────────────
function NewsRow({ event, timeLabel, urgent }: { event: CalendarEvent; timeLabel: string; urgent?: boolean }): JSX.Element {
  return (
    <div className="flex items-center justify-between py-1.5 border-t border-glass/40">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-400 truncate">{event.title}</p>
        <p className="text-[10px] text-slate-500">{event.country}</p>
      </div>
      <span className={`shrink-0 text-xs font-medium ml-3 ${urgent ? 'text-orange-400' : 'text-slate-500'}`}>
        {timeLabel}
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AnalysisReport(): JSX.Element {
  const location        = useLocation()
  const navigate        = useNavigate()
  const isOpen          = useReportStore(s => s.isOpen)
  const closeReport     = useReportStore(s => s.closeReport)
  const latestReport    = useReportStore(s => s.latestReport)
  const deleteReport    = useReportStore(s => s.deleteReport)
  const remaining       = useReportStore(s => s.remainingReports())
  const devToolsEnabled = useSettingsStore(s => s.devToolsEnabled)
  const userId          = useAuthStore(s => s.user?.id)
  const addTrade        = useTradesStore(s => s.addTrade)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [logState, setLogState] = useState<'idle' | 'open' | 'saving' | 'done'>('idle')
  const [logSize,  setLogSize]  = useState('1')
  const [logError, setLogError] = useState<string | null>(null)

  useEffect(() => { setLogState('idle'); setLogSize('1'); setLogError(null) }, [latestReport?.id])
  useEffect(() => { closeReport() }, [location.pathname])

  const candles  = latestReport?.candles  ?? []
  const analysis = latestReport?.analysis ?? null

  const rsiSeries = useMemo(() => computeRSISeries(candles), [candles])
  const emaSeries = useMemo(() => computeEMASeries(candles, 20), [candles])
  const setup     = useMemo(() => deriveSetup(analysis), [analysis])

  const tradeSetupSection = analysis?.deepAnalysis.find(s => s.startsWith('Trade Setup::'))
  const tradeSetupBody    = tradeSetupSection ? tradeSetupSection.slice('Trade Setup::'.length).trim() : null
  const otherSections     = analysis?.deepAnalysis.filter(s => !s.startsWith('Trade Setup::')) ?? []

  const handleDelete = () => {
    if (!latestReport) return
    if (!confirmDelete) { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 3000); return }
    playPaperScrunch()
    deleteReport(latestReport.id)
    setConfirmDelete(false)
  }

  const handleLogSetup = async () => {
    if (!userId || !setup || !latestReport || !analysis) return
    setLogState('saving')
    setLogError(null)
    const result = await addTrade(userId, {
      symbol:    latestReport.symbol,
      direction: setup.side,
      entry:     setup.entry,
      size:      Math.max(0.01, parseFloat(logSize) || 1),
      notes:     `Report simulation · ${latestReport.symbol} ${latestReport.interval} · Stop ${setup.stop.toFixed(setup.dec)} · Target ${setup.target.toFixed(setup.dec)}`,
    })
    if (result.ok && result.id) { navigate(`/journal?highlight=${result.id}`) }
    else if (result.ok)        { setLogState('done') }
    else                       { setLogError(result.error ?? 'Failed to save'); setLogState('open') }
  }

  return (
    <div
      className="fixed left-14 lg:left-48 right-0 bottom-0 z-50 flex flex-col bg-surface-1 border-t border-l border-glass shadow-glass transition-transform duration-300 ease-out overflow-hidden"
      style={{ height: '82%', transform: isOpen ? 'translateY(0)' : 'translateY(100%)' }}
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-glass shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-slate-100 font-semibold text-sm leading-none">
              {latestReport?.symbol ?? '—'}
            </p>
            <span className="text-[10px] text-slate-500 font-mono bg-surface-2 border border-glass px-1.5 py-0.5 rounded">
              {latestReport?.interval ?? ''}
            </span>
            {analysis && analysis.direction !== 'flat' && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                analysis.direction === 'up'
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : 'text-red-400 bg-red-500/10 border-red-500/20'
              }`}>
                {analysis.direction === 'up' ? '↑ Long' : '↓ Short'}
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            {latestReport
              ? new Date(latestReport.generatedAt).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })
              : '—'}
            {' · '}{remaining}/{REPORTS_PER_DAY} reports left
          </p>
        </div>

        {analysis && (
          <div className="shrink-0 text-right">
            <div className="text-2xl font-bold tabular-nums leading-none" style={{ color: scoreColor(analysis.score) }}>
              {analysis.score}
            </div>
            <SignalBars score={analysis.score} direction={analysis.direction} />
          </div>
        )}

        <div className="flex items-center gap-1 shrink-0">
          {latestReport && (
            <button
              onClick={handleDelete}
              title={confirmDelete ? 'Click again to confirm' : 'Delete report'}
              className={`flex items-center justify-center rounded-md text-[10px] font-medium border transition-all duration-150 ${
                confirmDelete
                  ? 'bg-red-500/15 border-red-500/35 text-red-400 px-2 h-6'
                  : 'w-6 h-6 bg-surface-2 border-glass text-slate-400 hover:text-red-400 hover:border-red-500/30'
              }`}
            >
              {confirmDelete ? 'Delete?' : (
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                  <path d="M2 4h10M5 4V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4M6 7v3.5M8 7v3.5M3 4l.8 7.5A.5.5 0 0 0 4.3 12h5.4a.5.5 0 0 0 .5-.5L11 4"/>
                </svg>
              )}
            </button>
          )}
          <button
            onClick={() => { closeReport(); setConfirmDelete(false) }}
            className="w-6 h-6 rounded bg-surface-2 hover:bg-surface-3 border border-glass flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors text-base leading-none"
          >
            ×
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {!latestReport || !analysis ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-slate-400 text-xs">No report generated yet.</p>
          </div>
        ) : (
          <div className="p-5 flex flex-col gap-6 max-w-5xl mx-auto">

            {/* ── Trade Setup card (top) ── */}
            {(tradeSetupBody || setup) && (
              <div className="rounded-xl border border-blue-500/15 bg-blue-500/[0.03] p-4">
                <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                  <p className="text-[10px] text-blue-400 uppercase tracking-widest font-semibold">Trade Setup</p>
                  {setup && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      setup.side === 'long' ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'
                    }`}>
                      {setup.side === 'long' ? '↑ Long' : '↓ Short'} · {setup.rr}:1 R:R
                    </span>
                  )}
                </div>

                {tradeSetupBody && (
                  <p className="text-sm text-slate-300 leading-relaxed mb-4">{tradeSetupBody}</p>
                )}

                {/* Journal integration */}
                {setup && userId && (
                  <div>
                    {logState === 'idle' && (
                      <button
                        onClick={() => setLogState('open')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 border border-glass text-slate-300 hover:text-slate-100 text-xs font-medium transition-all"
                      >
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 2v8M2 6h8"/>
                        </svg>
                        Simulate in Journal
                      </button>
                    )}

                    {logState === 'open' && (
                      <div className="flex flex-col gap-2.5">
                        <div className="flex items-center gap-3 text-[11px] flex-wrap">
                          <span className="text-slate-500">Entry</span>
                          <span className="font-mono text-slate-200">{setup.entry.toFixed(setup.dec)}</span>
                          <span className="text-slate-600">·</span>
                          <span className="text-slate-500">Stop</span>
                          <span className="font-mono text-red-400">{setup.stop.toFixed(setup.dec)}</span>
                          <span className="text-slate-600">·</span>
                          <span className="text-slate-500">Target</span>
                          <span className="font-mono text-emerald-400">{setup.target.toFixed(setup.dec)}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <label className="text-[11px] text-slate-500">Lots</label>
                          <input
                            type="number" min="0.01" step="0.01"
                            value={logSize}
                            onChange={e => setLogSize(e.target.value)}
                            className="w-16 bg-surface-2 border border-glass rounded-md px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-blue-500/50 transition-colors"
                          />
                          <button
                            onClick={handleLogSetup}
                            className="px-3 py-1 rounded-lg bg-blue-500 hover:bg-blue-400 text-xs font-semibold text-white transition-colors"
                          >
                            Add to Journal
                          </button>
                          <button
                            onClick={() => setLogState('idle')}
                            className="px-2 py-1 rounded-lg text-slate-500 hover:text-slate-300 text-xs transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                        {logError && (
                          <p className="text-[11px] text-red-400">{logError}</p>
                        )}
                      </div>
                    )}

                    {logState === 'saving' && (
                      <p className="text-xs text-slate-400">Saving…</p>
                    )}

                    {logState === 'done' && (
                      <div className="flex items-center gap-2 text-xs text-emerald-400">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 6l3 3 5-5"/>
                        </svg>
                        Added to journal
                        <button
                          onClick={() => { setLogState('idle'); setLogSize('1') }}
                          className="ml-auto text-slate-500 hover:text-slate-300 transition-colors"
                        >
                          Simulate again
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Stats + Chart row ── */}
            <div className="flex flex-col sm:flex-row gap-5">

              {/* Left: chart */}
              <div className="sm:w-56 md:w-64 shrink-0">
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1.5">Price · EMA 20 · RSI 14</p>
                <CandleChart
                  candles={candles}
                  rsiSeries={rsiSeries}
                  emaSeries={emaSeries}
                  support={analysis.support}
                  resistance={analysis.resistance}
                  currentPrice={analysis.currentPrice}
                />
                <div className="flex items-center gap-2.5 mt-1.5 text-[9px] text-slate-500 flex-wrap">
                  <span className="flex items-center gap-1"><span className="w-3 h-px bg-blue-400 inline-block rounded" />EMA 20</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-px bg-violet-400 inline-block rounded" />RSI 14</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-px border-t border-dashed border-emerald-400/50 inline-block" />S</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-px border-t border-dashed border-red-400/50 inline-block" />R</span>
                </div>
              </div>

              {/* Right: key stats + confidence */}
              <div className="flex-1 flex flex-col gap-4 justify-between">
                {/* Key stats */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-surface-2/50 border border-glass rounded-lg p-2.5">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">RSI 14</p>
                    <p className={`text-lg font-bold tabular-nums ${
                      analysis.rsi === null ? 'text-slate-400' :
                      analysis.rsi > 70 ? 'text-red-400' :
                      analysis.rsi < 30 ? 'text-emerald-400' : 'text-slate-200'
                    }`}>
                      {analysis.rsi ?? '—'}
                    </p>
                  </div>
                  <div className="bg-surface-2/50 border border-glass rounded-lg p-2.5">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Avg Range</p>
                    <p className="text-lg font-bold tabular-nums text-slate-200">
                      {analysis.atr !== null
                        ? analysis.currentPrice !== null && analysis.currentPrice < 100
                          ? `${(analysis.atr * 10000).toFixed(1)}p`
                          : `$${analysis.atr.toFixed(2)}`
                        : '—'}
                    </p>
                  </div>
                </div>

                {/* Confidence breakdown */}
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Confidence</p>
                  <div className="flex flex-col gap-1.5">
                    <ScoreBar label="Direction" value={analysis.components.trendScore}      colorClass="bg-blue-500" />
                    <ScoreBar label="Structure" value={analysis.components.volatilityScore} colorClass="bg-violet-500" />
                    <ScoreBar label="Timing"    value={analysis.components.newsScore}       colorClass="bg-emerald-500" />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Analysis narrative ── */}
            {latestReport.aiGenerated === false && (
              <p className="text-xs text-slate-500">
                Analysis unavailable. Try again or check your connection.
              </p>
            )}
            {otherSections.length > 0 && (
              <div className="flex flex-col gap-4">
                {otherSections.map((para, i) => (
                  <AnalysisSection key={i} text={para} />
                ))}
              </div>
            )}

            {/* ── Events ── */}
            {(analysis.upcomingEvents.length > 0 || analysis.recentEvents.length > 0) && (
              <div className="flex flex-col gap-1">
                {analysis.upcomingEvents.length > 0 && (
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-0.5">Upcoming</p>
                    {analysis.upcomingEvents.map((e, i) => {
                      const mins = Math.round((e.timestamp - Date.now()) / 60_000)
                      return <NewsRow key={i} event={e} timeLabel={minsUntil(e.timestamp)} urgent={mins < 30} />
                    })}
                  </div>
                )}
                {analysis.recentEvents.length > 0 && (
                  <div className={analysis.upcomingEvents.length > 0 ? 'mt-2' : ''}>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-0.5">Recent</p>
                    {analysis.recentEvents.map((e, i) => (
                      <NewsRow key={i} event={e} timeLabel={minsAgo(e.timestamp)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* DevTools label */}
            {devToolsEnabled && latestReport.aiGenerated !== undefined && (
              <div className="flex items-center gap-1.5 pt-1">
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${latestReport.aiGenerated ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                <span className={`text-[10px] ${latestReport.aiGenerated ? 'text-emerald-400/70' : 'text-slate-500'}`}>
                  {latestReport.aiGenerated ? 'Generated by Gemini' : 'Generated by local'}
                </span>
              </div>
            )}

            <div className="h-3" />
          </div>
        )}
      </div>
    </div>
  )
}
