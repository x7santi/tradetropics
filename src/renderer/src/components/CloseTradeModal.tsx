import { useState } from 'react'
import { useTradesStore, type Trade } from '@renderer/store/tradesStore'
import { useMarketStore } from '@renderer/store/marketStore'
import { useChartStore }  from '@renderer/store/chartStore'

interface Props {
  trade: Trade
  onClose: () => void
}

function decimalsFor(symbol: string): number {
  const s = symbol.toUpperCase()
  if (s.includes('JPY')) return 3
  if (s.includes('/') && !s.match(/BTC|ETH|SOL|ADA|XRP|DOGE|AVAX|LINK|DOT|MATIC|LTC|BNB/)) return 5
  return 2
}

export default function CloseTradeModal({ trade, onClose }: Props): JSX.Element {
  const closeTrade   = useTradesStore(s => s.closeTrade)
  const entryScore   = useMarketStore(s => s.entryScore)
  const activeSymbol = useChartStore(s => s.symbol)

  const dp = decimalsFor(trade.symbol)
  const currentPrice = activeSymbol === trade.symbol ? (entryScore?.currentPrice ?? null) : null

  const [exitStr, setExitStr] = useState(currentPrice != null ? currentPrice.toFixed(dp) : '')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const exit       = parseFloat(exitStr)
  const validExit  = !isNaN(exit) && exit > 0
  const previewPnl = validExit
    ? (trade.direction === 'long'
        ? (exit - trade.entry) * trade.size
        : (trade.entry - exit) * trade.size)
    : null

  const handleConfirm = async () => {
    if (!validExit) { setError('Enter a valid exit price.'); return }
    setSaving(true)
    setError(null)
    const result = await closeTrade(trade.id, exit)
    setSaving(false)
    if (result.ok) onClose()
    else setError(result.error ?? 'Failed to close trade.')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface-1 border border-glass rounded-xl p-6 w-80 shadow-glass animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm font-semibold text-slate-100">Close Trade</p>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-300 hover:bg-white/[0.06] transition-colors text-base"
          >×</button>
        </div>

        {/* Trade summary */}
        <div className="bg-surface-2 border border-glass/50 rounded-lg px-3 py-2.5 mb-4 grid grid-cols-4 gap-1 text-xs">
          <div>
            <p className="text-slate-500">Symbol</p>
            <p className="text-slate-200 font-medium">{trade.symbol}</p>
          </div>
          <div>
            <p className="text-slate-500">Side</p>
            <p className={trade.direction === 'long' ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'}>
              {trade.direction === 'long' ? '↑ Long' : '↓ Short'}
            </p>
          </div>
          <div>
            <p className="text-slate-500">Entry</p>
            <p className="text-slate-200 font-mono">{trade.entry.toFixed(dp)}</p>
          </div>
          <div>
            <p className="text-slate-500">Size</p>
            <p className="text-slate-200 font-mono">{trade.size}</p>
          </div>
        </div>

        {/* Exit price input */}
        <div className="mb-4">
          <label className="text-xs text-slate-400 mb-1.5 block">
            Exit price
            {currentPrice != null && (
              <span className="ml-2 text-slate-500 font-normal">
                current: {currentPrice.toFixed(dp)}
              </span>
            )}
          </label>
          <input
            type="number"
            step="any"
            min="0"
            autoFocus
            value={exitStr}
            onChange={e => setExitStr(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleConfirm()}
            placeholder={`0.${'0'.repeat(dp)}`}
            className="w-full bg-surface-2 border border-glass rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500/50 transition-colors placeholder:text-slate-600"
          />
        </div>

        {/* P&L preview */}
        {previewPnl !== null && (
          <div className={`text-center text-xl font-bold tabular-nums font-mono mb-4 ${
            previewPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
          }`}>
            {previewPnl >= 0 ? '+' : ''}{previewPnl.toFixed(2)}
            <span className="text-xs font-normal text-slate-500 ml-1.5">P&L</span>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-400 bg-red-400/[0.08] border border-red-400/15 rounded-lg px-3 py-2 mb-3">
            {error}
          </p>
        )}

        <button
          onClick={handleConfirm}
          disabled={saving || !validExit}
          className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold text-white transition-colors"
        >
          {saving ? 'Closing…' : 'Close Trade'}
        </button>
      </div>
    </div>
  )
}
