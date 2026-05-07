import { useState } from 'react'
import Layout from '@renderer/components/Layout'
import { useReportStore, REPORTS_PER_DAY } from '@renderer/store/reportStore'
import type { ReportData } from '@renderer/store/reportStore'
import { playPaperScrunch } from '@renderer/lib/sounds'


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

function ScoreMini({ value }: { value: number }): JSX.Element {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-20 h-1.5 bg-surface-3 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: scoreColor(value) }} />
      </div>
      <span className="text-xs font-bold tabular-nums font-mono" style={{ color: scoreColor(value) }}>{value}</span>
    </div>
  )
}

function ReportCard({ report, isUnread, onOpen, onDelete }: {
  report:   ReportData
  isUnread: boolean
  onOpen:   () => void
  onDelete: () => void
}): JSX.Element {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { symbol, interval, generatedAt, analysis } = report

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

  return (
    <div className="group relative">
      <button
        onClick={onOpen}
        className={`w-full text-left bg-surface-1 hover:bg-surface-2 border hover:border-blue-500/20 rounded-xl p-4 transition-all duration-150 ${
          isUnread ? 'border-blue-500/25' : 'border-glass'
        }`}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            {isUnread && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
            )}
            <span className="px-2 py-0.5 rounded-md bg-surface-3 border border-glass text-xs font-bold text-slate-200">
              {symbol}
            </span>
            <span className="text-[10px] text-slate-400 uppercase tracking-wide">{interval}</span>
          </div>
          <div className="text-right shrink-0 pr-7">
            <p className="text-[10px] text-slate-400">{formatDate(generatedAt)}</p>
            <p className="text-[10px] text-slate-600">{formatTime(generatedAt)} · {relativeTime(generatedAt)}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <ScoreMini value={analysis.score} />
          <span className={`text-xs font-semibold ${labelColor(analysis.score)}`}>{analysis.label}</span>
        </div>

        {analysis.deepAnalysis?.[0] && (
          <p className="text-[10px] text-slate-400 mt-2 leading-relaxed line-clamp-2 group-hover:text-slate-400 transition-colors">
            {analysis.deepAnalysis[0].replace('::', ': ')}
          </p>
        )}

        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-glass/50">
          {(['trendScore', 'volatilityScore', 'newsScore'] as const).map((key) => {
            const v   = analysis.components[key]
            const lbl = key === 'trendScore' ? 'Dir' : key === 'volatilityScore' ? 'Struct' : 'Timing'
            return (
              <div key={key} className="flex items-center gap-1">
                <span className="text-[9px] text-slate-400 uppercase">{lbl}</span>
                <span className="text-[10px] font-mono tabular-nums"
                  style={{ color: v >= 70 ? '#34d399' : v >= 45 ? '#fbbf24' : '#f87171' }}>
                  {v}
                </span>
              </div>
            )
          })}
          {analysis.rsi !== null && (
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-slate-400 uppercase">RSI</span>
              <span className={`text-[10px] font-mono tabular-nums ${analysis.rsi > 70 ? 'text-red-400' : analysis.rsi < 30 ? 'text-emerald-400' : 'text-slate-400'}`}>
                {analysis.rsi}
              </span>
            </div>
          )}
          <div className="flex-1" />
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-slate-400 group-hover:text-blue-400 transition-colors shrink-0">
            <path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      {/* Delete button — appears on hover, positioned top-right */}
      <button
        onClick={handleDeleteClick}
        className={`absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all duration-150
          opacity-0 group-hover:opacity-100
          ${confirmDelete
            ? 'bg-red-500/15 border border-red-500/30 text-red-400 opacity-100'
            : 'bg-surface-3 border border-glass text-slate-400 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10'
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

export default function ReportsPage(): JSX.Element {
  const reports      = useReportStore(s => s.reports)
  const loading      = useReportStore(s => s.loading)
  const openById     = useReportStore(s => s.openReportById)
  const deleteReport = useReportStore(s => s.deleteReport)
  const markAsRead   = useReportStore(s => s.markAsRead)
  const readIds      = useReportStore(s => s.readIds)
  const remaining    = useReportStore(s => s.remainingReports())
  const usageCount   = useReportStore(s => s.usageCount)

  const grouped = groupByDate(reports)

  return (
    <Layout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-glass shrink-0">
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-slate-100 text-lg font-semibold">Analysis Reports</h1>
              <p className="text-slate-400 text-xs mt-0.5">
                {loading
                  ? 'Loading…'
                  : reports.length === 0
                  ? 'No reports taken yet'
                  : `${reports.length} report${reports.length !== 1 ? 's' : ''} saved to your account`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">
                <span className="text-slate-300 font-semibold tabular-nums">{remaining}</span>
                <span className="text-slate-400"> / {REPORTS_PER_DAY} remaining this 12h window</span>
              </p>
              {usageCount > 0 && (
                <p className="text-[10px] text-slate-600 mt-0.5">Quota resets 12h after first use</p>
              )}
            </div>
          </div>
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
              <div className="w-12 h-12 rounded-full bg-surface-2 border border-glass flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.3)" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              </div>
              <div>
                <p className="text-slate-400 text-sm font-medium">No reports yet</p>
                <p className="text-slate-400 text-xs mt-1 leading-snug max-w-xs">
                  Hover over the Entry Score widget on the Dashboard and click "Generate Report" to generate your first analysis.
                </p>
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto flex flex-col gap-6">
              {grouped.map(({ label, items }) => (
                <div key={label}>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-2 px-1">{label}</p>
                  <div className="flex flex-col gap-2">
                    {items.map(report => (
                      <ReportCard
                        key={report.id}
                        report={report}
                        isUnread={!readIds.has(report.id)}
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
