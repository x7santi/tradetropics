import { useState, useRef, useEffect } from 'react'
import { useChartStore }  from '@renderer/store/chartStore'
import { useMarketStore } from '@renderer/store/marketStore'
import { useAuthStore }   from '@renderer/store/authStore'
import { useTradesStore } from '@renderer/store/tradesStore'

interface Props { onClose: () => void }

// ── Pip size per symbol ───────────────────────────────────────────────────────
function getPipInfo(symbol: string): { pipSize: number; decimals: number } {
  const s = symbol.toUpperCase()
  if (s.includes('JPY')) return { pipSize: 0.01,     decimals: 3 }
  if (s.includes('/') && !s.match(/BTC|ETH|SOL|ADA|XRP|DOGE|AVAX|LINK|DOT|MATIC|LTC|BNB/))
    return { pipSize: 0.0001, decimals: 5 }
  if (s.match(/BTC|ETH1!/)) return { pipSize: 1,    decimals: 2 }
  if (s.match(/ETH|SOL/))   return { pipSize: 0.01, decimals: 2 }
  return { pipSize: 0.01, decimals: 2 }   // stocks, ETFs, futures
}

// ── Stepper button ────────────────────────────────────────────────────────────
function Stepper({
  onStart, onStop,
  label, className = '',
}: {
  onStart: () => void
  onStop:  () => void
  label: string
  className?: string
}): JSX.Element {
  return (
    <button
      type="button"
      onMouseDown={onStart}
      onMouseUp={onStop}
      onMouseLeave={onStop}
      onTouchStart={onStart}
      onTouchEnd={onStop}
      className={`w-7 h-7 flex items-center justify-center rounded-md text-sm font-bold transition-colors select-none shrink-0 ${className}`}
    >
      {label}
    </button>
  )
}

export default function LogTradeModal({ onClose }: Props): JSX.Element {
  const symbol     = useChartStore((s) => s.symbol)
  const entryScore = useMarketStore((s) => s.entryScore)
  const candles    = useMarketStore((s) => s.candles)
  const user       = useAuthStore((s) => s.user)
  const addTrade   = useTradesStore((s) => s.addTrade)

  // Auto-fill entry from current price
  const currentPrice = entryScore?.currentPrice
    ?? (candles.length > 0 ? candles[candles.length - 1].close : null)

  const { pipSize, decimals } = getPipInfo(symbol)

  const [form, setForm] = useState({
    symbol,
    direction: 'long' as 'long' | 'short',
    entry:      currentPrice != null ? currentPrice.toFixed(decimals) : '',
    exit_price: '',
    size:       '1',
    notes:      '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const patch = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  // Hold-to-accelerate refs
  const tickRef = useRef(0)
  const holdRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (holdRef.current) clearInterval(holdRef.current) }, [])

  const adjust = (field: 'entry' | 'exit_price', dir: 1 | -1, tick: number) => {
    const multiplier = Math.pow(2, Math.min(Math.floor(tick / 6), 6)) // doubles every 6 ticks, caps at ×64
    const step = pipSize * multiplier * dir
    setForm(f => {
      const cur = parseFloat(f[field]) || 0
      return { ...f, [field]: Math.max(0, cur + step).toFixed(decimals) }
    })
  }

  const startHold = (field: 'entry' | 'exit_price', dir: 1 | -1) => {
    tickRef.current = 0
    adjust(field, dir, 0)
    holdRef.current = setInterval(() => {
      tickRef.current++
      // Only start climbing after 0.5s of holding down.
      // tick 0 corresponds to immediate startHold call; tick>=5 => 500ms.
      if (tickRef.current < 5) return
      adjust(field, dir, tickRef.current)
    }, 100)
  }

  const stopHold = () => {
    if (holdRef.current) { clearInterval(holdRef.current); holdRef.current = null }
  }

  const handleSubmit = async () => {
    if (!user || !form.entry || !form.symbol) return
    const entry = parseFloat(form.entry)
    if (isNaN(entry) || entry <= 0) { setError('Entry price must be a positive number.'); return }

    setSaving(true)
    setError(null)
    const result = await addTrade(user.id, {
      symbol:     form.symbol.trim().toUpperCase(),
      direction:  form.direction,
      entry,
      exit_price: form.exit_price ? parseFloat(form.exit_price) : undefined,
      size:       parseFloat(form.size) || 1,
      notes:      form.notes.trim() || undefined,
    })
    setSaving(false)
    if (result.ok) {
      onClose()
    } else {
      setError(result.error ?? 'Failed to save trade. Check your connection and try again.')
    }
  }

  const fieldCls = 'flex-1 bg-surface-2 border border-glass rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500/50 transition-colors placeholder:text-slate-400 min-w-0'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface-1 border border-glass rounded-xl p-6 w-[22rem] shadow-glass animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm font-semibold text-slate-100">Log Trade</p>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-300 hover:bg-white/[0.06] transition-colors text-base"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {/* Symbol */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Symbol</label>
            <input
              className={`${fieldCls} w-full`}
              value={form.symbol}
              onChange={(e) => patch('symbol', e.target.value)}
            />
          </div>

          {/* Direction */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Direction</label>
            <div className="flex gap-2">
              {(['long', 'short'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => patch('direction', d)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-150 border ${
                    form.direction === d
                      ? d === 'long'
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-red-500/15 text-red-400 border-red-500/30'
                      : 'bg-surface-2 text-slate-400 border-glass hover:text-slate-300'
                  }`}
                >
                  {d === 'long' ? '↑ Long' : '↓ Short'}
                </button>
              ))}
            </div>
          </div>

          {/* Entry with pip stepper */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">
              Entry *
              {currentPrice != null && (
                <span className="ml-2 text-slate-500 normal-case font-normal">
                  current: {currentPrice.toFixed(decimals)}
                </span>
              )}
            </label>
            <div className="flex items-center gap-1.5">
              <Stepper
                label="−"
                onStart={() => startHold('entry', -1)}
                onStop={stopHold}
                className="bg-surface-2 border border-glass text-slate-400 hover:text-slate-200 hover:bg-surface-3"
              />
              <input
                type="number" step="any" min="0"
                className={fieldCls}
                placeholder="0.00"
                value={form.entry}
                onChange={(e) => patch('entry', e.target.value)}
              />
              <Stepper
                label="+"
                onStart={() => startHold('entry', 1)}
                onStop={stopHold}
                className="bg-surface-2 border border-glass text-slate-400 hover:text-slate-200 hover:bg-surface-3"
              />
            </div>
          </div>

          {/* Exit with pip stepper */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Exit</label>
            <div className="flex items-center gap-1.5">
              <Stepper
                label="−"
                onStart={() => {
                  // If exit is empty, initialize to current pip position to save time.
                  if (!form.exit_price) {
                    const exitBase = (() => {
                      // snap current price to pip grid
                      const cp = entryScore?.currentPrice ?? (candles.length > 0 ? candles[candles.length - 1].close : null)
                      if (cp == null || !pipSize) return ''
                      const snapped = Math.floor(cp / pipSize) * pipSize
                      return snapped.toFixed(decimals)
                    })()
                    if (exitBase) setForm(f => ({ ...f, exit_price: exitBase }))
                  }
                  startHold('exit_price', -1)
                }}
                onStop={stopHold}
                className="bg-surface-2 border border-glass text-slate-400 hover:text-slate-200 hover:bg-surface-3"
              />
              <input
                type="number" step="any" min="0"
                className={fieldCls}
                placeholder="optional"
                value={form.exit_price}
                onChange={(e) => patch('exit_price', e.target.value)}
              />
              <Stepper
                label="+"
                onStart={() => {
                  // If exit is empty, initialize to current pip position to save time.
                  if (!form.exit_price) {
                    const exitBase = (() => {
                      // snap current price to pip grid
                      const cp = entryScore?.currentPrice ?? (candles.length > 0 ? candles[candles.length - 1].close : null)
                      if (cp == null || !pipSize) return ''
                      const snapped = Math.floor(cp / pipSize) * pipSize
                      return snapped.toFixed(decimals)
                    })()
                    if (exitBase) setForm(f => ({ ...f, exit_price: exitBase }))
                  }
                  startHold('exit_price', 1)
                }}
                onStop={stopHold}
                className="bg-surface-2 border border-glass text-slate-400 hover:text-slate-200 hover:bg-surface-3"
              />
            </div>
          </div>

          {/* Size */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Size / Lots</label>
            <input
              type="number" step="any" min="0"
              className={`${fieldCls} w-full`}
              value={form.size}
              onChange={(e) => patch('size', e.target.value)}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Notes</label>
            <textarea
              rows={2}
              className={`${fieldCls} w-full resize-none`}
              placeholder="Setup rationale, lessons learned…"
              value={form.notes}
              onChange={(e) => patch('notes', e.target.value)}
            />
          </div>

          <p className="text-[10px] text-slate-600">Hold +/− for 0.5 s to accelerate pip stepping</p>

          {error && (
            <p className="text-xs text-red-400 bg-red-400/8 border border-red-400/15 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={saving || !form.entry || !form.symbol}
          className="mt-5 w-full py-2.5 rounded-lg bg-blue-500 hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold text-white transition-colors"
        >
          {saving ? 'Saving…' : 'Log Trade'}
        </button>
      </div>
    </div>
  )
}
