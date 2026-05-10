import { useEffect, useRef, useState } from 'react'
import { LineChart, Line, ResponsiveContainer, Tooltip, ReferenceLine } from 'recharts'
import { useChartStore } from '@renderer/store/chartStore'
import { fetchCandles } from '@renderer/lib/finnhub'
import { backtestEMACross, backtestRSI, type BacktestResult } from '@renderer/lib/backtest'

// ── Stat card ─────────────────────────────────────────────────────────────────

function Stat({ label, value, positive }: { label: string; value: string; positive?: boolean | null }): JSX.Element {
  const color = positive === true ? 'text-emerald-400' : positive === false ? 'text-red-400' : 'text-slate-200'
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[9px] text-slate-500 uppercase tracking-widest">{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  )
}

// ── Preset definitions ────────────────────────────────────────────────────────

type Strategy = 'ema' | 'rsi'

interface Preset {
  label: string
  description: string
  strategy: Strategy
  params: { fast?: number; slow?: number; period?: number; oversold?: number; overbought?: number }
}

const PRESETS: Preset[] = [
  { label: 'EMA 9/21',    description: 'Short-term trend',  strategy: 'ema', params: { fast: 9,  slow: 21  } },
  { label: 'EMA 20/50',   description: 'Swing trading',     strategy: 'ema', params: { fast: 20, slow: 50  } },
  { label: 'EMA 50/200',  description: 'Long-term trend',   strategy: 'ema', params: { fast: 50, slow: 200 } },
  { label: 'RSI Default', description: '30 / 70 reversal',  strategy: 'rsi', params: { period: 14, oversold: 30, overbought: 70 } },
  { label: 'RSI Tight',   description: '40 / 60 reversal',  strategy: 'rsi', params: { period: 14, oversold: 40, overbought: 60 } },
]

// ── Main panel ────────────────────────────────────────────────────────────────

export default function BacktestPanel({ onClose }: { onClose: () => void }): JSX.Element {
  const symbol = useChartStore(s => s.symbol)

  const [advancedMode, setAdvancedMode] = useState(false)
  const [activePreset, setActivePreset] = useState<number>(0)

  const [strategy,   setStrategy]   = useState<Strategy>('ema')
  const [fastPeriod, setFastPeriod] = useState(9)
  const [slowPeriod, setSlowPeriod] = useState(21)
  const [rsiPeriod,  setRsiPeriod]  = useState(14)
  const [oversold,   setOversold]   = useState(30)
  const [overbought, setOverbought] = useState(70)

  const [result,  setResult]  = useState<BacktestResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  async function run(
    strat: Strategy = strategy,
    fast  = fastPeriod,
    slow  = slowPeriod,
    rsiP  = rsiPeriod,
    os    = oversold,
    ob    = overbought,
  ) {
    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const candles = await fetchCandles(symbol, 500, '1day', abort.signal, {
        allowSyntheticOnCredit: false,
      })
      if (abort.signal.aborted) return
      if (candles.length < 30) throw new Error('Not enough daily candle data for this symbol.')

      const res = strat === 'ema'
        ? backtestEMACross(candles, fast, slow)
        : backtestRSI(candles, rsiP, os, ob)

      if (!abort.signal.aborted) setResult(res)
    } catch (err) {
      if (abort.signal.aborted) return
      setError(err instanceof Error ? err.message : 'Backtest failed.')
    } finally {
      if (!abort.signal.aborted) setLoading(false)
    }
  }

  // Apply a preset and immediately run
  function applyPreset(idx: number) {
    const p = PRESETS[idx]
    setActivePreset(idx)
    setStrategy(p.strategy)
    if (p.strategy === 'ema' && p.params.fast !== undefined && p.params.slow !== undefined) {
      setFastPeriod(p.params.fast)
      setSlowPeriod(p.params.slow)
      run('ema', p.params.fast, p.params.slow, rsiPeriod, oversold, overbought)
    } else if (p.strategy === 'rsi' && p.params.period !== undefined) {
      setRsiPeriod(p.params.period)
      setOversold(p.params.oversold ?? 30)
      setOverbought(p.params.overbought ?? 70)
      run('rsi', fastPeriod, slowPeriod, p.params.period, p.params.oversold ?? 30, p.params.overbought ?? 70)
    }
  }

  // Auto-run on symbol change or when switching to advanced (re-run with current params)
  useEffect(() => {
    if (advancedMode) {
      run()
    } else {
      applyPreset(activePreset)
    }
  }, [symbol])

  const wins = result?.trades.filter(t => t.pnlPct > 0).length ?? 0
  const losses = (result?.trades.length ?? 0) - wins
  const returnPos = result ? result.totalReturn >= 0 : null

  const curveData = result
    ? (result.equityCurve.length > 200
        ? result.equityCurve.filter((_, i) => i % Math.ceil(result.equityCurve.length / 200) === 0)
        : result.equityCurve)
    : []

  return (
    <div className="border-t border-amber-500/20 bg-surface-1 shrink-0 flex flex-col" style={{ height: advancedMode ? 260 : 220 }}>

      {/* Header bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-glass/60 shrink-0">

        {/* Mode badge */}
        <span className="text-[9px] text-amber-400/80 uppercase tracking-widest font-semibold">Backtest</span>

        {/* Simple / Advanced toggle */}
        <div className="flex items-center gap-0.5 bg-surface-2 border border-glass rounded-md p-0.5">
          {(['Simple', 'Advanced'] as const).map(mode => {
            const isAdv = mode === 'Advanced'
            const active = advancedMode === isAdv
            return (
              <button
                key={mode}
                onClick={() => {
                  setAdvancedMode(isAdv)
                  if (!isAdv) applyPreset(activePreset)
                  else run()
                }}
                className={`px-2.5 py-0.5 rounded text-[10px] font-medium transition-all ${
                  active
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {mode}
              </button>
            )
          })}
        </div>

        {/* Controls — Simple: preset pills | Advanced: parameter inputs */}
        {!advancedMode ? (
          <div className="flex items-center gap-1 flex-wrap">
            {PRESETS.map((p, i) => (
              <button
                key={p.label}
                onClick={() => applyPreset(i)}
                title={p.description}
                className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-all ${
                  activePreset === i
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    : 'text-slate-500 border-glass hover:text-slate-300 hover:bg-white/[0.04]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 text-[10px] text-slate-400">
            {/* Strategy toggle */}
            <div className="flex items-center gap-0.5 bg-surface-2 border border-glass rounded-md p-0.5">
              {([['ema', 'EMA Cross'], ['rsi', 'RSI Reversal']] as [Strategy, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => { setStrategy(key); run(key) }}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                    strategy === key
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* EMA params */}
            {strategy === 'ema' ? (
              <>
                <label className="flex items-center gap-1">
                  Fast
                  <input type="number" min={2} max={50} value={fastPeriod}
                    onChange={e => setFastPeriod(+e.target.value)}
                    className="w-10 bg-surface-2 border border-glass rounded px-1.5 py-0.5 text-slate-200 text-center focus:outline-none focus:border-blue-500/40"
                  />
                </label>
                <label className="flex items-center gap-1">
                  Slow
                  <input type="number" min={3} max={200} value={slowPeriod}
                    onChange={e => setSlowPeriod(+e.target.value)}
                    className="w-10 bg-surface-2 border border-glass rounded px-1.5 py-0.5 text-slate-200 text-center focus:outline-none focus:border-blue-500/40"
                  />
                </label>
              </>
            ) : (
              <>
                <label className="flex items-center gap-1">
                  Period
                  <input type="number" min={2} max={50} value={rsiPeriod}
                    onChange={e => setRsiPeriod(+e.target.value)}
                    className="w-10 bg-surface-2 border border-glass rounded px-1.5 py-0.5 text-slate-200 text-center focus:outline-none focus:border-blue-500/40"
                  />
                </label>
                <label className="flex items-center gap-1">
                  OS
                  <input type="number" min={10} max={49} value={oversold}
                    onChange={e => setOversold(+e.target.value)}
                    className="w-10 bg-surface-2 border border-glass rounded px-1.5 py-0.5 text-slate-200 text-center focus:outline-none focus:border-blue-500/40"
                  />
                </label>
                <label className="flex items-center gap-1">
                  OB
                  <input type="number" min={51} max={90} value={overbought}
                    onChange={e => setOverbought(+e.target.value)}
                    className="w-10 bg-surface-2 border border-glass rounded px-1.5 py-0.5 text-slate-200 text-center focus:outline-none focus:border-blue-500/40"
                  />
                </label>
                <button
                  onClick={() => run()}
                  disabled={loading}
                  className="px-2.5 py-0.5 rounded text-[10px] bg-blue-500/15 border border-blue-500/25 text-blue-400 hover:bg-blue-500/25 disabled:opacity-40 transition-colors"
                >
                  {loading ? 'Running…' : 'Run'}
                </button>
              </>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-3">
          {result && (
            <span className="text-[9px] text-slate-500 truncate max-w-[200px]" title={result.strategyLabel}>
              {symbol} · {result.strategyLabel} · 1D bars
            </span>
          )}
          <button
            onClick={onClose}
            className="w-5 h-5 flex items-center justify-center rounded text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors text-sm"
          >
            ×
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Stats column */}
        <div className="flex flex-col justify-center gap-3.5 px-5 py-3 shrink-0 w-52 border-r border-glass/40">
          {loading ? (
            <div className="flex items-center gap-2 text-slate-500 text-xs">
              <div className="w-3.5 h-3.5 border-2 border-amber-400/40 border-t-amber-400 rounded-full animate-spin" />
              Running…
            </div>
          ) : error ? (
            <p className="text-xs text-slate-500 leading-snug">{error}</p>
          ) : result ? (
            <>
              <Stat label="Total return"   value={`${result.totalReturn >= 0 ? '+' : ''}${result.totalReturn.toFixed(1)}%`} positive={returnPos} />
              <Stat label="Win rate"       value={`${result.winRate.toFixed(0)}%`} positive={result.winRate >= 50 ? true : false} />
              <Stat label="Trades"         value={`${result.trades.length}  (${wins}W / ${losses}L)`} />
              <Stat label="Max drawdown"   value={`-${result.maxDrawdown.toFixed(1)}%`} positive={result.maxDrawdown < 15 ? true : false} />
            </>
          ) : null}
        </div>

        {/* Equity curve */}
        <div className="flex-1 min-w-0 py-2 pr-3">
          {result && curveData.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curveData} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                <ReferenceLine y={0} stroke="rgba(148,163,184,0.15)" strokeDasharray="3 3" />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(15,23,42,0.92)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 6,
                    fontSize: 10,
                    color: '#cbd5e1',
                    padding: '4px 8px',
                  }}
                  formatter={(v: number) => [`${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, 'Equity']}
                  labelFormatter={() => ''}
                />
                <Line
                  type="monotone"
                  dataKey="equity"
                  dot={false}
                  strokeWidth={1.5}
                  stroke={result.totalReturn >= 0 ? '#34d399' : '#f87171'}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : !loading && !error ? (
            <div className="flex items-center justify-center h-full text-slate-600 text-xs">
              No trades generated — try different parameters
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
