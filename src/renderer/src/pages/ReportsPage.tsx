import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '@renderer/components/Layout'
import { useReportStore, REPORTS_PER_DAY } from '@renderer/store/reportStore'
import type { ReportData } from '@renderer/store/reportStore'
import { useTradesStore } from '@renderer/store/tradesStore'
import { useAuthStore } from '@renderer/store/authStore'
import { playPaperScrunch } from '@renderer/lib/sounds'
import type { EntryScoreResult } from '@renderer/lib/confidence'

function priceDec(p: number | null): number {
  if (p === null) return 5
  if (p >= 1000) return 2
  if (p >= 10)   return 3
  return 5
}

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

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts
  const m = Math.floor(diffMs / 60_000)
  const h = Math.floor(diffMs / 3_600_000)
  const d = Math.floor(diffMs / 86_400_000)
  if (d > 0) return `${d}d ago`
  if (h > 0) return `${h}h ago`
  if (m > 0) return `${m}m ago`
  return 'just now'
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'Today'
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function ScoreRing({ value }: { value: number }): JSX.Element {
  const r   = 18
  const circ = 2 * Math.PI * r
  const pct  = value / 100
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="shrink-0">
      <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
      <circle
        cx="22" cy="22" r={r} fill="none"
        stroke={scoreColor(value)} strokeWidth="3"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round"
        transform="rotate(-90 22 22)"
      />
      <text x="22" y="26" textAnchor="middle" fontSize="10" fontWeight="700" fill={scoreColor(value)} fontFamily="monospace">
        {value}
      </text>
    </svg>
  )
}

function DirectionBadge({ direction }: { direction: string }): JSX.Element {
  if (direction === 'up')   return <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/15 border border-emerald-500/25 text-emerald-400">LONG</span>
  if (direction === 'down') return <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-500/15 border border-red-500/25 text-red-400">SHORT</span>
  return <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-500/15 border border-slate-500/25 text-slate-400">FLAT</span>
}

function ReportCard({ report, isUnread, userId, addTrade, onOpen, onDelete }: {
  report:    ReportData
  isUnread:  boolean
  userId:    string | undefined
  addTrade:  ReturnType<typeof useTradesStore>['addTrade']
  onOpen:    () => void
  onDelete:  () => void
}): JSX.Element {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [simState, setSimState] = useState<'idle' | 'saving' | 'done'>('idle')
  const { symbol, interval, generatedAt, analysis } = report
  const setup = deriveSetup(analysis)

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirmDelete) {
      playPaperScrunch()
      onDelete()
    } else {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
    }
  }

  const handleSimulate = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!userId || !setup || simState !== 'idle') return
    setSimState('saving')
    const result = await addTrade(userId, {
      symbol,
      direction: setup.side,
      entry:     setup.entry,
      size:      1,
      notes:     `Report simulation · ${symbol} ${interval} · Score ${analysis.score}/100 · Stop ${setup.stop.toFixed(setup.dec)} · Target ${setup.target.toFixed(setup.dec)}`,
    })
    setSimState(result.ok ? 'done' : 'idle')
    if (result.ok) setTimeout(() => setSimState('idle'), 3000)
  }

  return (
    <div className="group relative">
      <button
        onClick={onOpen}
        className={`w-full text-left rounded-xl p-4 transition-all duration-150 border ${
          isUnread
            ? 'bg-white/[0.04] border-blue-500/20 hover:bg-white/[0.06] hover:border-blue-500/30'
            : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.10]'
        } backdrop-blur-sm`}
      >
        {/* Top row */}
        <div className="flex items-start gap-3">
          <ScoreRing value={analysis.score} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />}
              <span className="text-sm font-bold text-slate-100">{symbol}</span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wide">{interval}</span>
              <DirectionBadge direction={analysis.direction} />
              <span className={`ml-auto text-xs font-semibold ${labelColor(analysis.score)}`}>{analysis.label}</span>
            </div>

            <div className="flex items-center gap-3 text-[10px] text-slate-500 mb-2">
              <span>{formatDate(generatedAt)} {formatTime(generatedAt)}</span>
              <span className="text-slate-600">·</span>
              <span>{relativeTime(generatedAt)}</span>
            </div>

            {/* Component mini-bar */}
            <div className="flex items-center gap-3">
              {(['trendScore', 'volatilityScore', 'newsScore'] as const).map((key) => {
                const v   = analysis.components[key]
                const lbl = key === 'trendScore' ? 'Dir' : key === 'volatilityScore' ? 'Struct' : 'Timing'
                return (
                  <div key={key} className="flex flex-col gap-0.5">
                    <span className="text-[8px] text-slate-500 uppercase tracking-wide">{lbl}</span>
                    <div className="flex items-center gap-1">
                      <div className="w-12 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${v}%`, background: v >= 70 ? '#34d399' : v >= 45 ? '#fbbf24' : '#f87171' }} />
                      </div>
                      <span className="text-[9px] font-mono tabular-nums" style={{ color: v >= 70 ? '#34d399' : v >= 45 ? '#fbbf24' : '#f87171' }}>{v}</span>
                    </div>
                  </div>
                )
              })}
              {analysis.rsi !== null && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[8px] text-slate-500 uppercase tracking-wide">RSI</span>
                  <span className={`text-[9px] font-mono tabular-nums ${analysis.rsi > 70 ? 'text-red-400' : analysis.rsi < 30 ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {analysis.rsi}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Deep analysis snippet */}
        {analysis.deepAnalysis?.[0] && (
          <p className="text-[10px] text-slate-400 mt-3 leading-relaxed line-clamp-2 pl-[56px]">
            {analysis.deepAnalysis[0].replace('::', ': ')}
          </p>
        )}

        {/* Setup + actions */}
        {(setup || true) && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/[0.04] pl-[56px]">
            {setup && (
              <span className={`text-[10px] font-mono tabular-nums px-2 py-0.5 rounded border ${
                setup.side === 'long'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/10 border-red-500/20 text-red-400'
              }`}>
                {setup.side === 'long' ? '▲' : '▼'} {setup.entry.toFixed(setup.dec)} → {setup.target.toFixed(setup.dec)} · {setup.rr}R
              </span>
            )}
            <div className="flex-1" />
            {setup && userId && (
              <button
                onClick={handleSimulate}
                disabled={simState === 'saving'}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border transition-all duration-150 shrink-0 ${
                  simState === 'done'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-blue-400 hover:border-blue-500/30 hover:bg-blue-500/5'
                }`}
              >
                {simState === 'done' ? (
                  <>
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6l3 3 5-5"/></svg>
                    Simulated
                  </>
                ) : simState === 'saving' ? '…' : (
                  <>
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2v8M2 6h8"/></svg>
                    Simulate
                  </>
                )}
              </button>
            )}
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-slate-500 group-hover:text-blue-400 transition-colors shrink-0">
              <path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </button>

      {/* Delete button */}
      <button
        onClick={handleDeleteClick}
        className={`absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all duration-150
          opacity-0 group-hover:opacity-100
          ${confirmDelete
            ? 'bg-red-500/15 border border-red-500/30 text-red-400 opacity-100'
            : 'bg-white/[0.04] border border-white/[0.08] text-slate-400 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10'
          }`}
      >
        {confirmDelete ? (
          <>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1 1l10 10M11 1L1 11" strokeLinecap="round"/>
            </svg>
            Confirm
          </>
        ) : (
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <path d="M2 4h10M5 4V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4M6 7v3.5M8 7v3.5M3 4l.8 7.5A.5.5 0 0 0 4.3 12h5.4a.5.5 0 0 0 .5-.5L11 4"/>
          </svg>
        )}
      </button>
    </div>
  )
}

function groupByDate(reports: ReportData[]): { label: string; items: ReportData[] }[] {
  const groups: Map<string, ReportData[]> = new Map()
  for (const r of reports) {
    const label = formatDate(r.generatedAt)
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push(r)
  }
  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }))
}

type SortKey = 'newest' | 'oldest' | 'score_high' | 'score_low'
type FilterKey = 'all' | 'long' | 'short' | 'flat' | 'strong' | 'weak'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest',     label: 'Newest' },
  { value: 'oldest',     label: 'Oldest' },
  { value: 'score_high', label: 'Score ↓' },
  { value: 'score_low',  label: 'Score ↑' },
]

const FILTER_OPTIONS: { value: FilterKey; label: string }[] = [
  { value: 'all',    label: 'All' },
  { value: 'long',   label: 'Long' },
  { value: 'short',  label: 'Short' },
  { value: 'flat',   label: 'Flat' },
  { value: 'strong', label: 'Strong (≥65)' },
  { value: 'weak',   label: 'Weak (<45)' },
]

export default function ReportsPage(): JSX.Element {
  const navigate     = useNavigate()
  const reports      = useReportStore(s => s.reports)
  const loading      = useReportStore(s => s.loading)
  const openById     = useReportStore(s => s.openReportById)
  const deleteReport = useReportStore(s => s.deleteReport)
  const markAsRead   = useReportStore(s => s.markAsRead)
  const readIds      = useReportStore(s => s.readIds)
  const remaining    = useReportStore(s => s.remainingReports())
  const usageCount   = useReportStore(s => s.usageCount)
  const userId       = useAuthStore(s => s.user?.id)
  const addTrade     = useTradesStore(s => s.addTrade)

  const [query,  setQuery]  = useState('')
  const [sort,   setSort]   = useState<SortKey>('newest')
  const [filter, setFilter] = useState<FilterKey>('all')

  const filtered = useMemo(() => {
    let list = [...reports]
    if (query.trim()) {
      const q = query.trim().toUpperCase()
      list = list.filter(r =>
        r.symbol.toUpperCase().includes(q) ||
        r.analysis.label?.toUpperCase().includes(q) ||
        r.interval.toUpperCase().includes(q)
      )
    }
    if (filter === 'long')   list = list.filter(r => r.analysis.direction === 'up')
    if (filter === 'short')  list = list.filter(r => r.analysis.direction === 'down')
    if (filter === 'flat')   list = list.filter(r => r.analysis.direction === 'flat')
    if (filter === 'strong') list = list.filter(r => r.analysis.score >= 65)
    if (filter === 'weak')   list = list.filter(r => r.analysis.score < 45)
    if (sort === 'newest')     list.sort((a, b) => b.generatedAt - a.generatedAt)
    if (sort === 'oldest')     list.sort((a, b) => a.generatedAt - b.generatedAt)
    if (sort === 'score_high') list.sort((a, b) => b.analysis.score - a.analysis.score)
    if (sort === 'score_low')  list.sort((a, b) => a.analysis.score - b.analysis.score)
    return list
  }, [reports, query, sort, filter])

  const avgScore   = reports.length ? Math.round(reports.reduce((s, r) => s + r.analysis.score, 0) / reports.length) : null
  const longCount  = reports.filter(r => r.analysis.direction === 'up').length
  const shortCount = reports.filter(r => r.analysis.direction === 'down').length
  const topSymbols = useMemo(() => {
    const counts: Record<string, number> = {}
    reports.forEach(r => { counts[r.symbol] = (counts[r.symbol] ?? 0) + 1 })
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([sym]) => sym)
  }, [reports])

  const grouped = groupByDate(filtered)

  return (
    <Layout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-white/[0.06] shrink-0">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h1 className="text-slate-100 text-lg font-semibold leading-tight">Analysis Reports</h1>
              <p className="text-slate-500 text-xs mt-0.5">
                {loading ? 'Loading…' : reports.length === 0 ? 'No reports yet' : `${reports.length} report${reports.length !== 1 ? 's' : ''} saved`}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-slate-400">
                <span className="text-slate-200 font-semibold tabular-nums">{remaining}</span>
                <span className="text-slate-500"> / {REPORTS_PER_DAY} remaining</span>
              </p>
              {usageCount > 0 && <p className="text-[10px] text-slate-600 mt-0.5">Resets 12h after first use</p>}
            </div>
          </div>

          {/* Analytics strip */}
          {reports.length >= 3 && (
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              {avgScore !== null && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <div className="w-2 h-2 rounded-full" style={{ background: scoreColor(avgScore) }} />
                  <span className="text-[10px] text-slate-500">Avg score</span>
                  <span className="text-xs font-bold tabular-nums" style={{ color: scoreColor(avgScore) }}>{avgScore}</span>
                </div>
              )}
              {(longCount > 0 || shortCount > 0) && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <span className="text-[10px] text-emerald-400 tabular-nums font-semibold">{longCount}L</span>
                  <span className="text-[10px] text-slate-600">/</span>
                  <span className="text-[10px] text-red-400 tabular-nums font-semibold">{shortCount}S</span>
                  <span className="text-[10px] text-slate-500">bias</span>
                </div>
              )}
              {topSymbols.length > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <span className="text-[10px] text-slate-500">Top:</span>
                  {topSymbols.map(sym => (
                    <span key={sym} className="text-[10px] font-semibold text-slate-300">{sym}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Search + filter row */}
          {reports.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {/* Search */}
              <div className="relative flex-1 min-w-[160px] max-w-[280px]">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                  <circle cx="5" cy="5" r="4"/><path d="m8.5 8.5 2 2"/>
                </svg>
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search symbol or label…"
                  className="w-full pl-7 pr-3 py-1.5 text-[11px] rounded-lg bg-white/[0.04] border border-white/[0.07] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/30 focus:ring-1 focus:ring-blue-500/10 transition-all"
                />
                {query && (
                  <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-sm leading-none">×</button>
                )}
              </div>

              {/* Filter pills */}
              <div className="flex items-center gap-1 flex-wrap">
                {FILTER_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    onClick={() => setFilter(o.value)}
                    className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all border ${
                      filter === o.value
                        ? 'bg-blue-500/15 border-blue-500/30 text-blue-300'
                        : 'bg-white/[0.03] border-white/[0.06] text-slate-500 hover:text-slate-300 hover:bg-white/[0.06]'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              {/* Sort */}
              <select
                value={sort}
                onChange={e => setSort(e.target.value as SortKey)}
                className="ml-auto text-[10px] rounded-md bg-white/[0.03] border border-white/[0.06] text-slate-400 px-2 py-1.5 focus:outline-none focus:border-blue-500/30 transition-all cursor-pointer"
              >
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-slate-400 text-xs">
              <div className="w-4 h-4 border-2 border-blue-400/40 border-t-blue-400 rounded-full animate-spin" />
              Loading reports…
            </div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.3)" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              </div>
              <div>
                <p className="text-slate-400 text-sm font-medium">No reports yet</p>
                <p className="text-slate-500 text-xs mt-1 leading-snug max-w-xs">
                  Hover over the Entry Score widget on the Dashboard and click "Generate Report" to generate your first analysis.
                </p>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-center">
              <p className="text-slate-400 text-sm">No reports match your filters</p>
              <button onClick={() => { setQuery(''); setFilter('all') }} className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors">Clear filters</button>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto flex flex-col gap-6">
              {grouped.map(({ label, items }) => (
                <div key={label}>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2 px-1 flex items-center gap-2">
                    {label}
                    <span className="text-slate-700">·</span>
                    <span>{items.length}</span>
                  </p>
                  <div className="flex flex-col gap-2">
                    {items.map(report => (
                      <ReportCard
                        key={report.id}
                        report={report}
                        isUnread={!readIds.has(report.id)}
                        userId={userId}
                        addTrade={addTrade}
                        onOpen={() => { markAsRead(report.id); openById(report.id) }}
                        onDelete={() => deleteReport(report.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
