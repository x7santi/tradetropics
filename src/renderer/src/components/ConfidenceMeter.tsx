import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMarketStore } from '@renderer/store/marketStore'
import { useChartStore } from '@renderer/store/chartStore'
import { useReportStore, REPORTS_PER_DAY, COOLDOWN_MS } from '@renderer/store/reportStore'
import { useAuthStore } from '@renderer/store/authStore'
import { useIsPro } from '@renderer/components/ProGate'
import { playToggleOn, playTypewriterKey } from '@renderer/lib/sounds'
import { getRefreshMs } from '@renderer/lib/intervals'
import type { EntryScoreResult } from '@renderer/lib/confidence'

// ── Constants ──────────────────────────────────────────────────────────────────
const W       = 232
const H       = 100
const CY      = H / 2
const PTS     = 160
const MIN_AMP = 1
const MAX_AMP = 20

// ── Helpers ────────────────────────────────────────────────────────────────────

function scoreToColor(score: number): string {
  return `hsl(${score * 1.2}, 88%, 56%)`
}

function buildPath(amplitude: number, phase: number, t: number, speed: number, cycles: number): string {
  let d = ''
  for (let i = 0; i <= PTS; i++) {
    const x     = (i / PTS) * W
    const angle = (i / PTS) * Math.PI * 2 * cycles
    // Primary smooth sine + very gentle long-wavelength swell for organic feel
    const y     = CY
      + Math.sin(angle + t * speed + phase)                      * amplitude
      + Math.sin(angle * 0.4 + t * speed * 0.35 + phase * 0.6)  * amplitude * 0.13
    d += i === 0 ? `M${x.toFixed(1)},${y.toFixed(1)}` : `L${x.toFixed(1)},${y.toFixed(1)}`
  }
  return d
}

function useAnimatedScore(target: number): number {
  const [displayed, setDisplayed] = useState(target)
  const fromRef  = useRef(target)
  const frameRef = useRef<number>(0)

  useEffect(() => {
    const from = fromRef.current
    const start = Date.now()
    const tick = () => {
      const t     = Math.min((Date.now() - start) / 700, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      const next  = Math.round(from + (target - from) * eased)
      fromRef.current = next
      setDisplayed(next)
      if (t < 1) frameRef.current = requestAnimationFrame(tick)
    }
    cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [target])

  return displayed
}


const TF_LABEL: Record<string, string> = {
  '1': '1m', '5': '5m', '15': '15m', '30': '30m',
  '60': '1H', '240': '4H', '4H': '4H',
  '1D': '1D', 'D': '1D', '1W': '1W', 'W': '1W', '1M': '1M',
}

function biasProps(direction: string | null, biasInterval?: string): { icon: string; text: string; cls: string } {
  const tf = biasInterval ? ` (${TF_LABEL[biasInterval] ?? biasInterval})` : ''
  if (direction === 'up')   return { icon: '↑', text: `Long${tf}`, cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' }
  if (direction === 'down') return { icon: '↓', text: `Short${tf}`, cls: 'text-red-400 bg-red-500/10 border-red-500/20' }
  return { icon: '→', text: `No Bias${tf}`, cls: 'text-slate-400 bg-slate-700/30 border-slate-600/20' }
}

function estimateReportGenerationMs(report: EntryScoreResult, candleCount: number): number {
  const textLength = [
    report.reason,
    report.analysis,
    ...report.deepAnalysis,
  ].join(' ').length
  const eventCount = report.upcomingEvents.length + report.recentEvents.length
  const extensiveness = Math.min(1, (textLength / 2200) * 0.65 + (candleCount / 180) * 0.25 + (eventCount / 12) * 0.1)
  const baseMs = 2000 + extensiveness * 7000
  const randomDeltaMs = (Math.random() - 0.5) * 1200

  return Math.round(Math.max(2000, Math.min(9000, baseMs + randomDeltaMs)))
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ConfidenceMeter(): JSX.Element {
  const entryScore = useMarketStore((s) => s.entryScore)
  const fetchError = useMarketStore((s) => s.fetchError)
  const candles    = useMarketStore((s) => s.candles)
  const symbol     = useChartStore((s) => s.symbol)
  const interval   = useChartStore((s) => s.interval)
  const userId     = useAuthStore((s) => s.user?.id)
  const isPro      = useIsPro()
  const navigate   = useNavigate()
  const takeReport           = useReportStore((s) => s.takeReport)
  const remaining            = useReportStore((s) => s.remainingReports())
  const getCooldownRemaining = useReportStore((s) => s.getCooldownRemaining)
  const cooldowns            = useReportStore((s) => s.cooldowns)
  const reportGeneration     = useReportStore((s) => s.reportGeneration)
  const setReportGeneration  = useReportStore((s) => s.setReportGeneration)
  const progressTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressDoneRef      = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Live countdown for per-symbol report cooldown (used in the gated section below)
  const cooldownExp = cooldowns[symbol] ?? 0
  const [cooldownSec, setCooldownSec] = useState(() => Math.ceil(Math.max(0, cooldownExp - Date.now()) / 1000))

  useEffect(() => {
    const rem = getCooldownRemaining(symbol)
    if (rem <= 0) { setCooldownSec(0); return }
    setCooldownSec(Math.ceil(rem / 1000))
    const id = setInterval(() => {
      const r = getCooldownRemaining(symbol)
      setCooldownSec(Math.ceil(r / 1000))
      if (r <= 0) clearInterval(id)
    }, 500)
    return () => clearInterval(id)
  }, [symbol, cooldownExp, getCooldownRemaining])

  // Live countdown until next entry-score refresh (top-right indicator)
  const nextRefreshAt = useMarketStore((s) => s.nextRefreshAt)
  const refreshTotalMs = getRefreshMs(interval)
  const [refreshSec, setRefreshSec] = useState<number | null>(null)

  useEffect(() => {
    if (!nextRefreshAt) { setRefreshSec(null); return }
    const tick = () => {
      const rem = nextRefreshAt - Date.now()
      setRefreshSec(rem > 0 ? Math.ceil(rem / 1000) : null)
    }
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [nextRefreshAt])

  const rawScore     = entryScore?.score        ?? null
  const direction    = entryScore?.direction    ?? null
  const biasInterval = entryScore?.biasInterval ?? interval
  const biasSentence = entryScore?.analysis ?? null
  const rsi          = entryScore?.rsi          ?? null
  const ema20        = entryScore?.ema20        ?? null
  const currentPrice = entryScore?.currentPrice ?? null

  const displayScore = useAnimatedScore(rawScore ?? 0)

  const wave1Ref    = useRef<SVGPathElement>(null)
  const wave2Ref    = useRef<SVGPathElement>(null)
  const wave3Ref    = useRef<SVGPathElement>(null)
  const scoreRef    = useRef<number>(rawScore ?? 50)
  const frameRef    = useRef<number>(0)
  const hoveredRef  = useRef(false)
  const accumRef    = useRef(0)
  const lastTsRef   = useRef(Date.now())
  const [waveHovered, setWaveHovered] = useState(false)

  useEffect(() => { scoreRef.current = rawScore ?? 50 }, [rawScore])

  useEffect(() => {
    const animate = () => {
      const now   = Date.now()
      const delta = (now - lastTsRef.current) / 1000
      lastTsRef.current = now

      const score = scoreRef.current
      const t01   = score / 100
      const amp   = MIN_AMP + (MAX_AMP - MIN_AMP) * t01
      const baseSpeed = 0.18 + t01 * 1.05
      const speed = hoveredRef.current ? baseSpeed * 1.35 : baseSpeed
      const color = scoreToColor(score)

      accumRef.current += delta * speed
      const t = accumRef.current

      wave1Ref.current?.setAttribute('d', buildPath(amp,          0,             t, 1,    1.2))
      wave1Ref.current?.setAttribute('stroke', color)
      wave2Ref.current?.setAttribute('d', buildPath(amp * 0.60, Math.PI * 0.6,  t, 0.78, 1.2))
      wave2Ref.current?.setAttribute('stroke', color)
      wave3Ref.current?.setAttribute('d', buildPath(amp * 0.35, Math.PI * 1.2,  t, 0.55, 1.2))
      wave3Ref.current?.setAttribute('stroke', color)

      frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameRef.current)
  }, [])

  const handleTakeReport = async () => {
    if (!entryScore || !userId || reportGeneration.active) return
    playToggleOn()

    const durationMs = estimateReportGenerationMs(entryScore, candles.length)
    const startedAt = Date.now()

    if (progressTimerRef.current) clearInterval(progressTimerRef.current)
    if (progressDoneRef.current) clearTimeout(progressDoneRef.current)

    setReportGeneration({ active: true, progress: 0 })

    progressTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt
      const linearProgress = Math.min(elapsed / durationMs, 1)
      const easedProgress = 1 - Math.pow(1 - linearProgress, 2.5)
      setReportGeneration({ active: true, progress: Math.min(96, easedProgress * 100) })
    }, 80)

    progressDoneRef.current = setTimeout(async () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current)
        progressTimerRef.current = null
      }

      const result = await takeReport({ symbol, interval, analysis: entryScore, candles }, userId)

      if (result.ok) {
        setReportGeneration({ active: true, progress: 100 })
        playTypewriterKey()
        setTimeout(() => setReportGeneration({ active: false, progress: 0 }), 550)
      } else {
        setReportGeneration({ active: false, progress: 0 })
      }
    }, durationMs)
  }

  if (rawScore === null) {
    return (
      <div className="flex flex-col gap-3 py-4 px-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.12em]">AI Entry Score</p>
        </div>
        <svg width={W} height={H}>
          <line x1={0} y1={CY} x2={W} y2={CY} stroke="#334155" strokeWidth={1} strokeDasharray="4 4" />
        </svg>
        <p className={`text-xs leading-snug ${fetchError ? 'text-orange-400' : 'text-slate-400'}`}>
          {fetchError ?? 'Waiting for data…'}
        </p>
      </div>
    )
  }

  const color = scoreToColor(rawScore)
  const bias  = biasProps(direction, biasInterval)

  // Circumference of circle r=4.5 in 12×12 viewBox ≈ 28.27
  const CIRC = 28.27
  // Progress drains from full → empty as the refresh approaches (inverted so circle empties over time)
  const refreshTotalSec  = refreshTotalMs / 1000
  const refreshProgress  = refreshSec != null ? refreshSec / refreshTotalSec : 0

  return (
    <div className="group flex flex-col gap-3 py-4 px-3 relative">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.12em]">AI Entry Score</p>
        {refreshSec != null && (
          <div className="flex items-center gap-1 opacity-75">
            <svg
              width="12" height="12" viewBox="0 0 12 12"
              style={{ transform: 'rotate(-90deg)' }}
            >
              <circle cx="6" cy="6" r="4.5" fill="none" stroke="rgba(148,163,184,0.10)" strokeWidth="1.5" />
              <circle
                cx="6" cy="6" r="4.5"
                fill="none"
                stroke="#64748b"
                strokeWidth="1.5"
                strokeDasharray={`${CIRC * refreshProgress} ${CIRC}`}
                strokeLinecap="round"
              />
            </svg>
            <span className="text-[9px] font-mono text-slate-500 tabular-nums">
              {refreshSec >= 60 ? `${Math.floor(refreshSec / 60)}m` : `${refreshSec}s`}
            </span>
          </div>
        )}
      </div>

      {/* Wave — always visible */}
      <div
        style={{ width: W, height: H, overflow: 'hidden', borderRadius: 4 }}
        onMouseEnter={() => { hoveredRef.current = true;  setWaveHovered(true)  }}
        onMouseLeave={() => { hoveredRef.current = false; setWaveHovered(false) }}
      >
      <svg
        width={W} height={H}
        aria-label={`AI Entry Score: ${rawScore}`}
        style={{ display: 'block', transform: waveHovered ? 'scale(1.16)' : 'scale(1)', transition: 'transform 0.3s ease-out', transformOrigin: 'center' }}
      >
        <defs>
          <filter id="tt-wave-glow" x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <line x1={0} y1={CY} x2={W} y2={CY} stroke="rgba(148,163,184,0.07)" strokeWidth={1} />
        <path ref={wave3Ref} fill="none" strokeWidth={1.2} strokeLinecap="round" opacity={0.25} filter="url(#tt-wave-glow)" />
        <path ref={wave2Ref} fill="none" strokeWidth={1.8} strokeLinecap="round" opacity={0.50} filter="url(#tt-wave-glow)" />
        <path ref={wave1Ref} fill="none" strokeWidth={2.5} strokeLinecap="round" opacity={1.0} filter="url(#tt-wave-glow)" />
      </svg>
      </div>

      {/* Symbol label */}
      <p className="text-xs font-semibold text-white tracking-wide -mt-1">{symbol}</p>

      {/* Score + bias — always visible for all users */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline gap-1 leading-none">
            <span className="text-4xl font-bold tabular-nums font-mono" style={{ color, transition: 'color 0.7s ease' }}>
              {displayScore}
            </span>
            <span className="text-slate-500 text-xs font-mono">/100</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-500 leading-none font-mono">
            <span className="tabular-nums">RSI {rsi ?? '—'}</span>
            <span className="text-slate-700">·</span>
            <span className="tabular-nums">
              EMA {ema20 !== null && currentPrice !== null ? (currentPrice > ema20 ? 'above' : 'below') : '—'}
            </span>
          </div>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${bias.cls}`}>
          {bias.icon} {bias.text}
        </span>
      </div>

      {/* Gated section — blurred with lock for free/expired users */}
      <div className="relative">
        <div
          className={!isPro ? 'pointer-events-none select-none' : ''}
          style={!isPro ? { filter: 'blur(4px)', opacity: 0.6 } : {}}
        >
          {/* Divider */}
          <div className="border-t border-glass" />

          {/* Analysis paragraph */}
          {biasSentence && (
            <div className="mt-3">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.12em] mb-1.5">Bias</p>
              <p className="text-xs text-slate-400 leading-relaxed">{biasSentence}</p>
            </div>
          )}

          {/* Generate Report / cooldown */}
          <div className="border-t border-glass pt-2 mt-3">
            {cooldownSec > 0 ? (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-2 border border-glass">
                <span className="text-xs text-slate-400">Cooldown</span>
                <div className="flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 14 14" className="-rotate-90">
                    <circle cx="7" cy="7" r="5" fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="1.5" />
                    <circle cx="7" cy="7" r="5" fill="none" stroke="#60a5fa" strokeWidth="1.5"
                      strokeDasharray={`${31.4 * (1 - cooldownSec / (COOLDOWN_MS / 1000))} 31.4`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="text-xs font-mono text-blue-400 tabular-nums">{cooldownSec}s</span>
                </div>
              </div>
            ) : (
              <button
                onClick={handleTakeReport}
                disabled={remaining === 0 || reportGeneration.active}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-surface-2 hover:bg-surface-3 border border-glass hover:border-blue-500/25 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_2px_6px_rgba(0,0,0,0.3)]"
              >
                <span className="text-xs font-medium text-slate-200">
                  {reportGeneration.active ? 'Generating…' : 'Generate Report'}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-500 tabular-nums font-mono">{remaining}/{REPORTS_PER_DAY}</span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-slate-400">
                    <path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </button>
            )}
            <p className="mt-2 text-[9px] leading-snug text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              Trade decisions remain yours. TradeTropics is an analysis tool and does not place, route, or execute trades.
            </p>
          </div>
        </div>

        {/* Lock overlay for free / expired users */}
        {!isPro && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="w-8 h-8 rounded-full bg-surface-3 border border-glass-strong flex items-center justify-center">
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <rect x="2" y="6" width="10" height="7" rx="1.5" stroke="#94a3b8" strokeWidth="1.3"/>
                <path d="M4.5 6V4.5a2.5 2.5 0 0 1 5 0V6" stroke="#94a3b8" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            </div>
            <button
              onClick={() => navigate('/paywall')}
              className="px-3 py-1 rounded-lg bg-blue-500 hover:bg-blue-400 text-xs font-bold text-white transition-colors"
            >
              Upgrade to Pro
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
