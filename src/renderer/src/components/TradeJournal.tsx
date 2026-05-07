import { useEffect, useState } from 'react'
import { useAuthStore } from '@renderer/store/authStore'
import { useTradesStore, type Trade } from '@renderer/store/tradesStore'
import LogTradeModal from './LogTradeModal'
import CloseTradeModal from './CloseTradeModal'

function fmtPrice(n: number): string {
  return n % 1 === 0 ? n.toString() : n.toFixed(n < 10 ? 4 : 2)
}

function fmtPnl(pnl: number | null): JSX.Element {
  if (pnl === null) return <span className="text-slate-400">Open</span>
  const sign = pnl >= 0 ? '+' : ''
  return (
    <span className={`font-mono ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
      {sign}{pnl.toFixed(2)}
    </span>
  )
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function WinRateBadge({ trades }: { trades: Trade[] }): JSX.Element {
  const closed = trades.filter((t) => t.pnl !== null)
  if (closed.length === 0) {
    return <span className="text-slate-400 text-xs">{trades.length} trade{trades.length !== 1 ? 's' : ''}</span>
  }
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length
  const rate = Math.round((wins / closed.length) * 100)
  return (
    <span className={`text-xs font-medium ${rate >= 50 ? 'text-emerald-400' : 'text-orange-400'}`}>
      {rate}% win · {closed.length} closed
    </span>
  )
}

export default function TradeJournal({ journalOpen, onToggle }: { journalOpen: boolean; onToggle: () => void }): JSX.Element {
  const user                             = useAuthStore((s) => s.user)
  const { trades, loading, fetchTrades, deleteTrade } = useTradesStore()
  const [showModal, setShowModal]        = useState(false)
  const [tradeToClose, setTradeToClose]  = useState<Trade | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  useEffect(() => {
    if (user?.id) fetchTrades(user.id)
  }, [user?.id, fetchTrades])

  return (
    <>
      <div className="shrink-0 flex flex-col border-t border-glass bg-surface-1">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-glass shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={onToggle}
              className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-300 transition-colors flex-shrink-0"
              title={journalOpen ? 'Collapse' : 'Expand'}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d={journalOpen ? 'M4 2l4 4-4 4' : 'M8 2L4 6l4 4'}
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <p className="text-xs text-slate-400 uppercase tracking-wider">Trade Journal</p>
            <WinRateBadge trades={trades} />
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="text-xs px-3 py-1 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
          >
            + Log Trade
          </button>
        </div>

        {/* Body — only shown when journalOpen is true */}
        {journalOpen && (
          <div className="h-52 flex-1 overflow-y-auto min-h-0">

            {loading && trades.length === 0 ? (
              <div className="flex flex-col gap-2 p-3">
                {[1, 2].map((i) => (
                  <div key={i} className="h-7 rounded-md bg-surface-2/50 animate-pulse" />
                ))}
              </div>
            ) : trades.length === 0 ? (
              <div className="flex items-center justify-center h-full pb-2">
                <p className="text-slate-400 text-xs">No trades yet — hit "+ Log Trade" to add your first</p>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-1 z-10">
                  <tr className="text-slate-400 uppercase tracking-wider">
                    <th className="text-left px-4 py-1.5 font-normal">Symbol</th>
                    <th className="text-left px-2 py-1.5 font-normal">Dir</th>
                    <th className="text-right px-2 py-1.5 font-normal">Entry</th>
                    <th className="text-right px-2 py-1.5 font-normal">Exit</th>
                    <th className="text-right px-2 py-1.5 font-normal">P&L</th>
                    <th className="text-right px-4 py-1.5 font-normal">Date</th>
                    <th className="text-center px-2 py-1.5 font-normal w-12">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t) => (
                    <tr
                      key={t.id}
                      className="border-t border-glass/50 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-4 py-2 text-slate-200 font-medium">{t.symbol}</td>
                      <td className="px-2 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          t.direction === 'long'
                            ? 'text-emerald-400 bg-emerald-400/10'
                            : 'text-red-400 bg-red-400/10'
                        }`}>
                          {t.direction === 'long' ? 'L' : 'S'}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right text-slate-300 font-mono">{fmtPrice(t.entry)}</td>
                      <td className="px-2 py-2 text-right font-mono">
                        {t.exit_price != null
                          ? <span className="text-slate-300">{fmtPrice(t.exit_price)}</span>
                          : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-2 py-2 text-right">{fmtPnl(t.pnl)}</td>
                      <td className="px-4 py-2 text-right text-slate-400">{fmtDate(t.created_at)}</td>
                      <td className="px-2 py-2 text-center relative">
                      {t.exit_price === null ? (
                        <button
                          onClick={() => setTradeToClose(t)}
                          className="text-xs px-2 py-1 rounded-md bg-slate-500/10 text-slate-400 border border-slate-500/20 hover:bg-slate-500/20 hover:text-slate-300 transition-colors"
                        >
                          Close
                        </button>
                      ) : pendingDelete === t.id ? (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => { deleteTrade(t.id); setPendingDelete(null) }}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/35 transition-colors"
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDelete(null)}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-slate-400 border border-glass hover:text-slate-200 transition-colors"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPendingDelete(t.id)}
                          className="p-1.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/25 hover:border-red-500/40 transition-colors"
                          title="Delete this trade"
                        >
                          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3.5 4h7" />
                            <path d="M5 4V2.8c0-.44.36-.8.8-.8h2.4c.44 0 .8.36.8.8V4" />
                            <path d="M5.2 6v5" />
                            <path d="M8.8 6v5" />
                          </svg>
                        </button>
                      )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {showModal && <LogTradeModal onClose={() => setShowModal(false)} />}
      {tradeToClose && <CloseTradeModal trade={tradeToClose} onClose={() => setTradeToClose(null)} />}
    </>
  )
}
