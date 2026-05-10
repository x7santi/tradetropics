import { useEffect, useState, useRef } from 'react'
import Layout from '@renderer/components/Layout'
import LogTradeModal from '@renderer/components/LogTradeModal'
import CloseTradeModal from '@renderer/components/CloseTradeModal'
import { useAuthStore } from '@renderer/store/authStore'
import { useTradesStore, type Trade } from '@renderer/store/tradesStore'
import { useChecklistStore, type ChecklistItem } from '@renderer/store/checklistStore'

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtPrice(n: number): string {
  return n % 1 === 0 ? n.toString() : n.toFixed(n < 10 ? 4 : 2)
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function csvEscape(value: string | number | null): string {
  if (value === null) return ''
  const s = String(value)
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
}

function exportTradesToCSV(trades: Trade[]): void {
  const header = ['Date', 'Symbol', 'Direction', 'Entry', 'Exit', 'Size', 'P&L', 'Status', 'Notes']
  const rows = trades.map(t => [
    new Date(t.created_at).toISOString().slice(0, 10),
    t.symbol,
    t.direction,
    fmtPrice(t.entry),
    t.exit_price !== null ? fmtPrice(t.exit_price) : '',
    t.size,
    t.pnl !== null ? t.pnl.toFixed(2) : '',
    t.pnl !== null ? 'Closed' : 'Open',
    t.notes ?? '',
  ].map(csvEscape).join(','))

  const csv = [header.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `trades-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function fmtDateGroup(iso: string): string {
  const d = new Date(iso)
  const today    = new Date()
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString())     return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }): JSX.Element {
  return (
    <div className="bg-surface-1 border border-glass rounded-xl px-4 py-3 flex flex-col gap-0.5">
      <p className="text-[10px] text-slate-400 uppercase tracking-widest">{label}</p>
      <p className="text-lg font-semibold text-slate-100 tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
    </div>
  )
}

function computeStats(trades: Trade[]) {
  const closed   = trades.filter(t => t.pnl !== null)
  const wins     = closed.filter(t => (t.pnl ?? 0) > 0)
  const totalPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0)
  const avgPnl   = closed.length > 0 ? totalPnl / closed.length : 0
  const winRate  = closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : null
  return { closed: closed.length, wins: wins.length, totalPnl, avgPnl, winRate }
}

// ── Trades tab ────────────────────────────────────────────────────────────────

function PnlCell({ pnl }: { pnl: number | null }): JSX.Element {
  if (pnl === null) return <span className="text-slate-400">Open</span>
  return (
    <span className={`font-mono ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
      {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
    </span>
  )
}

function TradeRow({ trade, onClose }: { trade: Trade; onClose?: () => void }): JSX.Element {
  return (
    <tr className="border-t border-glass/50 hover:bg-white/[0.02] transition-colors">
      <td className="px-5 py-2.5 text-slate-200 font-medium">{trade.symbol}</td>
      <td className="px-3 py-2.5">
        <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${
          trade.direction === 'long' ? 'text-emerald-400 bg-emerald-400/10' : 'text-red-400 bg-red-400/10'
        }`}>
          {trade.direction === 'long' ? '↑ Long ' : '↓ Short'}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-slate-300">{fmtPrice(trade.entry)}</td>
      <td className="px-3 py-2.5 text-right font-mono">
        {trade.exit_price != null
          ? <span className="text-slate-300">{fmtPrice(trade.exit_price)}</span>
          : <span className="text-slate-600">—</span>}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-slate-400">{trade.size}</td>
      <td className="px-3 py-2.5 text-right"><PnlCell pnl={trade.pnl} /></td>
      <td className="px-3 py-2.5 text-right text-slate-400 text-[11px] max-w-[200px] truncate">
        {trade.notes ?? <span className="text-slate-700">—</span>}
      </td>
      <td className="px-5 py-2.5 text-right text-right flex items-center gap-2 justify-end">
        {trade.exit_price === null && onClose && (
          <button
            onClick={onClose}
            className="text-xs px-2 py-1 rounded-md bg-slate-500/10 text-slate-400 border border-slate-500/20 hover:bg-slate-500/20 hover:text-slate-300 transition-colors"
          >
            Close
          </button>
        )}
        <span className="text-slate-400 text-[11px]">{fmtDate(trade.created_at)}</span>
      </td>
    </tr>
  )
}

function TradesTab({ trades, loading, onLog, onTradeClose }: {
  trades: Trade[]
  loading: boolean
  onLog: () => void
  onTradeClose: (trade: Trade) => void
}): JSX.Element {
  // Group trades by date
  const groups: { label: string; trades: Trade[] }[] = []
  for (const t of trades) {
    const label = fmtDateGroup(t.created_at)
    const last  = groups[groups.length - 1]
    if (last && last.label === label) last.trades.push(t)
    else groups.push({ label, trades: [t] })
  }

  if (loading && trades.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 gap-2 text-slate-400 text-xs">
        <div className="w-4 h-4 border-2 border-blue-400/40 border-t-blue-400 rounded-full animate-spin" />
        Loading trades…
      </div>
    )
  }

  if (trades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
        <div className="w-12 h-12 rounded-full bg-surface-2 border border-glass flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.3)" strokeWidth="1.5" strokeLinecap="round">
            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
        </div>
        <div>
          <p className="text-slate-400 text-sm font-medium">No trades yet</p>
          <p className="text-slate-500 text-xs mt-1">Hit "+ Log Trade" to record your first position</p>
        </div>
        <button
          onClick={onLog}
          className="mt-1 flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-400 text-sm font-semibold text-white transition-colors"
        >
          + Log Trade
        </button>
      </div>
    )
  }

  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-surface-base z-10">
        <tr className="text-slate-400 uppercase tracking-wider text-[10px]">
          <th className="text-left px-5 py-3 font-normal">Symbol</th>
          <th className="text-left px-3 py-3 font-normal">Dir</th>
          <th className="text-right px-3 py-3 font-normal">Entry</th>
          <th className="text-right px-3 py-3 font-normal">Exit</th>
          <th className="text-right px-3 py-3 font-normal">Size</th>
          <th className="text-right px-3 py-3 font-normal">P&L</th>
          <th className="text-right px-3 py-3 font-normal">Notes</th>
          <th className="text-right px-5 py-3 font-normal">Action</th>
        </tr>
        <tr><td colSpan={8} className="h-px bg-glass" /></tr>
      </thead>
      <tbody>
        {groups.map(({ label, trades: groupTrades }) => (
          <>
            <tr key={`g-${label}`}>
              <td colSpan={8} className="px-5 pt-4 pb-1.5">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">{label}</span>
              </td>
            </tr>
            {groupTrades.map(trade => <TradeRow key={trade.id} trade={trade} onClose={() => onTradeClose(trade)} />)}
          </>
        ))}
      </tbody>
    </table>
  )
}

// ── Checklist tab ─────────────────────────────────────────────────────────────

function ChecklistRow({ item, onToggle, onRemove }: {
  item: ChecklistItem
  onToggle: () => void
  onRemove: () => void
}): JSX.Element {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-glass/40 last:border-0 group">
      <button
        onClick={onToggle}
        className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-all ${
          item.checked
            ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
            : 'bg-surface-base border-glass/60 hover:border-slate-500'
        }`}
      >
        {item.checked && (
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <span className={`flex-1 text-sm leading-snug transition-colors ${
        item.checked ? 'text-slate-500 line-through' : 'text-slate-200'
      }`}>
        {item.text}
      </span>
      <button
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-all text-sm"
      >
        ×
      </button>
    </div>
  )
}

function ChecklistTab(): JSX.Element {
  const user                                 = useAuthStore(s => s.user)
  const { items, loading, loadItems, toggle, add, remove, resetChecks } = useChecklistStore()
  const [newText, setNewText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (user?.id) loadItems(user.id) }, [user?.id])

  const checkedCount = items.filter(i => i.checked).length

  const handleAdd = () => {
    const t = newText.trim()
    if (!t || !user?.id) return
    add(user.id, t)
    setNewText('')
    inputRef.current?.focus()
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd()
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Summary bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-glass/50 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-300 font-medium">
            {checkedCount}/{items.length} checked
          </span>
          {items.length > 0 && (
            <div className="h-1.5 w-24 bg-surface-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500/60 rounded-full transition-all duration-300"
                style={{ width: `${items.length > 0 ? (checkedCount / items.length) * 100 : 0}%` }}
              />
            </div>
          )}
        </div>
        {checkedCount > 0 && (
          <button
            onClick={() => { if (user?.id) resetChecks(user.id) }}
            className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors uppercase tracking-wide"
          >
            Reset all
          </button>
        )}
      </div>

      {/* Item list */}
      <div className="flex-1 overflow-y-auto min-h-0 px-1">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-600 text-xs">Loading…</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center">
            <p className="text-slate-500 text-sm">No checklist items yet</p>
            <p className="text-slate-600 text-xs mt-1">Add your pre-trade conditions below</p>
          </div>
        ) : (
          <div className="mx-4 my-3 bg-surface-1 border border-glass rounded-xl overflow-hidden">
            {items.map(item => (
              <ChecklistRow
                key={item.id}
                item={item}
                onToggle={() => toggle(item.id)}
                onRemove={() => remove(item.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add new item */}
      <div className="shrink-0 px-5 py-4 border-t border-glass">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Add a checklist item…"
            className="flex-1 bg-surface-1 border border-glass rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/40 transition-colors"
          />
          <button
            onClick={handleAdd}
            disabled={!newText.trim()}
            className="px-4 py-2 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/25 text-blue-400 text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-slate-600">
          Press Enter to add · Hover items to delete · Checks reset on click
        </p>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'trades' | 'checklist'

export default function JournalPage(): JSX.Element {
  const user                             = useAuthStore(s => s.user)
  const { trades, loading, fetchTrades } = useTradesStore()
  const [showModal, setShowModal]        = useState(false)
  const [tab,       setTab]              = useState<Tab>('trades')
  const [tradeToClose, setTradeToClose]  = useState<Trade | null>(null)

  useEffect(() => {
    if (user?.id) fetchTrades(user.id)
  }, [user?.id, fetchTrades])

  const stats = computeStats(trades)

  return (
    <Layout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-glass shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-slate-100 text-lg font-semibold">Trade Journal</h1>
              <p className="text-slate-400 text-xs mt-0.5">
                {loading && trades.length === 0
                  ? 'Loading…'
                  : `${trades.length} trade${trades.length !== 1 ? 's' : ''} logged`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {trades.length > 0 && (
                <button
                  onClick={() => exportTradesToCSV(trades)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-1 hover:bg-surface-2 border border-glass text-slate-400 hover:text-slate-200 text-sm font-medium transition-colors"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                  </svg>
                  Export CSV
                </button>
              )}
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-400 text-sm font-semibold text-white transition-colors"
              >
                + Log Trade
              </button>
            </div>
          </div>

          {/* Stats row — always shown once trades exist */}
          {trades.length > 0 && (
            <div className="grid grid-cols-4 gap-3 mb-4">
              <StatCard
                label="Win Rate"
                value={stats.winRate !== null ? `${stats.winRate}%` : '—'}
                sub={`${stats.wins} wins / ${stats.closed} closed`}
              />
              <StatCard
                label="Total P&L"
                value={`${stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(2)}`}
                sub={`${stats.closed} closed trades`}
              />
              <StatCard
                label="Avg P&L"
                value={stats.closed > 0 ? `${stats.avgPnl >= 0 ? '+' : ''}${stats.avgPnl.toFixed(2)}` : '—'}
                sub="per closed trade"
              />
              <StatCard
                label="Open Positions"
                value={String(trades.filter(t => t.pnl === null).length)}
                sub="no exit price set"
              />
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1">
            {([['trades', 'Trades'], ['checklist', 'Checklist']] as [Tab, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  tab === key
                    ? 'bg-blue-500/15 text-blue-400 border border-blue-500/25'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent hover:bg-white/[0.04]'
                }`}
              >
                {label}
                {key === 'trades' && trades.length > 0 && (
                  <span className="ml-1.5 text-[10px] opacity-60 tabular-nums">{trades.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {tab === 'trades' ? (
            <TradesTab trades={trades} loading={loading} onLog={() => setShowModal(true)} onTradeClose={setTradeToClose} />
          ) : (
            <ChecklistTab />
          )}
        </div>
      </div>

      {showModal && <LogTradeModal onClose={() => setShowModal(false)} />}
      {tradeToClose && <CloseTradeModal trade={tradeToClose} onClose={() => setTradeToClose(null)} />}
    </Layout>
  )
}
