import { useEffect, useState, useRef, useCallback } from 'react'
import Layout from '@renderer/components/Layout'
import { useAuthStore }    from '@renderer/store/authStore'
import { useCalendarStore } from '@renderer/store/calendarStore'
import { useTradesStore, type Trade } from '@renderer/store/tradesStore'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { fetchCalendarEventsGrouped } from '@renderer/lib/calendar'
import type { CalendarEvent } from '@renderer/lib/confidence'

// ── DST helpers ───────────────────────────────────────────────────────────────

function lastSundayOf(year: number, month0: number): Date {
  const d = new Date(year, month0 + 1, 0)
  d.setDate(d.getDate() - d.getDay())
  return d
}

function nthSundayOf(year: number, month0: number, n: number): Date {
  const d = new Date(year, month0, 1)
  const firstSunday = d.getDay() === 0 ? 1 : 8 - d.getDay()
  return new Date(year, month0, firstSunday + (n - 1) * 7)
}

function isInBST(date: Date): boolean {
  const y = date.getFullYear()
  return date >= lastSundayOf(y, 2) && date < lastSundayOf(y, 9)
}

function isInEDT(date: Date): boolean {
  const y = date.getFullYear()
  return date >= nthSundayOf(y, 2, 2) && date < nthSundayOf(y, 10, 1)
}

function getMarketSessions(date: Date): { london: Date; newYork: Date } {
  const y = date.getFullYear(), mo = date.getMonth(), d = date.getDate()
  const londonUTC = isInBST(date) ? 7 : 8
  const nyUTC     = isInEDT(date) ? 13 : 14
  return {
    london:  new Date(Date.UTC(y, mo, d, londonUTC, 0, 0)),
    newYork: new Date(Date.UTC(y, mo, d, nyUTC, 30, 0)),
  }
}

// ── Date utilities ────────────────────────────────────────────────────────────

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function todayStr(): string {
  const n = new Date()
  return toDateStr(n.getFullYear(), n.getMonth() + 1, n.getDate())
}

function tradeDateStr(trade: Trade): string {
  // Use opened_at for date grouping — allows backdated fake trades
  return (trade.opened_at || trade.created_at).split('T')[0]
}

function dayIdFromStr(dateStr: string): string {
  return dateStr.replace(/-/g, '')
}

function fmtPnl(pnl: number): string {
  if (pnl === 0) return '$0'
  const abs  = Math.abs(pnl)
  const sign = pnl > 0 ? '+' : '-'
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(1)}k`
  return `${sign}$${abs.toFixed(0)}`
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const DOW_LONG = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

function formatSessionTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatEventTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

// ── Build Mon-Sun week grid ───────────────────────────────────────────────────

type CalDay = { dateStr: string; day: number; isCurrentMonth: boolean }

function buildWeeks(year: number, month: number): CalDay[][] {
  const daysInMonth = new Date(year, month, 0).getDate()
  const firstDow    = new Date(year, month - 1, 1).getDay() // 0=Sun
  const startOffset = firstDow === 0 ? 6 : firstDow - 1    // days to go back to reach Mon

  const all: CalDay[] = []

  for (let i = startOffset; i > 0; i--) {
    const d = new Date(year, month - 1, 1 - i)
    all.push({ dateStr: toDateStr(d.getFullYear(), d.getMonth() + 1, d.getDate()), day: d.getDate(), isCurrentMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    all.push({ dateStr: toDateStr(year, month, d), day: d, isCurrentMonth: true })
  }
  const tail = (7 - (all.length % 7)) % 7
  for (let d = 1; d <= tail; d++) {
    const dt = new Date(year, month, d)
    all.push({ dateStr: toDateStr(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()), day: d, isCurrentMonth: false })
  }

  const weeks: CalDay[][] = []
  for (let i = 0; i < all.length; i += 7) weeks.push(all.slice(i, i + 7))
  return weeks
}

// ── Day grid cell ─────────────────────────────────────────────────────────────

function DayGridCell({
  dateStr, day, isCurrentMonth, isToday, isSelected, pnl, tradeCount, hasNote, hasEvent, onClick,
}: CalDay & {
  isToday: boolean
  isSelected: boolean
  pnl: number
  tradeCount: number
  hasNote: boolean
  hasEvent: boolean
  onClick: () => void
}): JSX.Element {
  const pnlColor = pnl > 0 ? 'text-emerald-400' : pnl < 0 ? 'text-red-400' : 'text-slate-600'
  const pnlBg    = pnl > 0 ? 'bg-emerald-500/8' : pnl < 0 ? 'bg-red-500/8' : ''

  if (!isCurrentMonth) {
    return (
      <div className="h-full p-2 flex flex-col opacity-30">
        <span className="text-xs font-medium text-slate-600">{String(day).padStart(2, '0')}</span>
      </div>
    )
  }

  return (
    <button
      onClick={onClick}
      className={`
        relative h-full p-2 flex flex-col text-left transition-all duration-150 rounded-lg mx-0.5 my-0.5
        ${isSelected
          ? 'bg-blue-500/15 ring-1 ring-blue-500/40 shadow-[0_0_12px_rgba(59,130,246,0.15)]'
          : `hover:bg-white/[0.04] hover:ring-1 hover:ring-white/[0.08] ${pnlBg}`
        }
        ${isToday && !isSelected ? 'ring-1 ring-blue-500/30 bg-blue-500/[0.06]' : ''}
      `}
    >
      {/* Day number + dots */}
      <div className="flex items-start justify-between w-full mb-auto">
        <span className={`text-sm font-semibold leading-none tabular-nums ${
          isToday ? 'text-blue-400' : isSelected ? 'text-slate-100' : 'text-slate-300'
        }`}>
          {String(day).padStart(2, '0')}
        </span>
        <div className="flex gap-0.5 mt-0.5">
          {hasNote  && <span className="w-1 h-1 rounded-full bg-blue-400/80 shrink-0" />}
          {hasEvent && <span className="w-1 h-1 rounded-full bg-rose-400/80 shrink-0" />}
        </div>
      </div>

      {/* P&L + count at bottom */}
      {(tradeCount > 0 || pnl !== 0) && (
        <div className="mt-1.5 flex flex-col gap-0.5">
          <span className={`text-[11px] font-semibold leading-none tabular-nums ${pnlColor}`}>
            {fmtPnl(pnl)}
          </span>
          <span className="text-[9px] text-slate-600 leading-none">
            {tradeCount}t
          </span>
        </div>
      )}
    </button>
  )
}

// ── Week total cell ───────────────────────────────────────────────────────────

function WeekTotalCell({ weekIndex, totalPnl, totalTrades }: {
  weekIndex: number
  totalPnl: number
  totalTrades: number
}): JSX.Element {
  const pnlColor = totalPnl > 0 ? 'text-emerald-400' : totalPnl < 0 ? 'text-red-400' : 'text-slate-600'
  const pnlBg    = totalPnl > 0 ? 'bg-emerald-500/8' : totalPnl < 0 ? 'bg-red-500/8' : 'bg-surface-2/30'

  return (
    <div className={`h-full p-2 flex flex-col justify-between rounded-lg mx-0.5 my-0.5 ${pnlBg} border border-white/[0.04]`}>
      <span className="text-[9px] font-semibold text-slate-600 uppercase tracking-widest leading-none">W{weekIndex + 1}</span>
      <div className="flex flex-col gap-0.5">
        <span className={`text-[11px] font-semibold leading-none tabular-nums ${pnlColor}`}>{fmtPnl(totalPnl)}</span>
        {totalTrades > 0 && (
          <span className="text-[9px] text-slate-600 leading-none">{totalTrades}t</span>
        )}
      </div>
    </div>
  )
}

// ── Sub-components (detail panel) ─────────────────────────────────────────────

function SessionRow({ label, time, timezone }: { label: string; time: Date; timezone: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between py-2 border-b border-glass/50 last:border-0">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-400/60 shrink-0" />
        <span className="text-sm text-slate-300 font-medium">{label}</span>
        <span className="text-[10px] text-slate-400 uppercase tracking-wide">{timezone}</span>
      </div>
      <span className="text-sm font-mono text-slate-200">{formatSessionTime(time)}</span>
    </div>
  )
}

function EventItem({ event }: { event: CalendarEvent }): JSX.Element {
  const isHigh = event.impact === 'High'
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-glass/40 last:border-0">
      <div className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${isHigh ? 'bg-rose-400' : 'bg-yellow-400/60'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-300 leading-snug">{event.title}</p>
        <p className="text-[10px] text-slate-400 mt-0.5">{event.country} · {formatEventTime(event.timestamp)}</p>
      </div>
      <span className={`shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
        isHigh
          ? 'bg-rose-400/10 text-rose-400 border border-rose-400/20'
          : 'bg-yellow-400/10 text-yellow-400 border border-yellow-400/20'
      }`}>
        {event.impact}
      </span>
    </div>
  )
}

function TradeRow({ trade }: { trade: Trade }): JSX.Element {
  const isLong   = trade.direction === 'long'
  const pnlColor = trade.pnl == null ? 'text-slate-400'
    : trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
  return (
    <div className="flex items-center gap-2.5 py-2 border-b border-glass/40 last:border-0">
      <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border ${
        isLong
          ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
          : 'text-red-400 bg-red-500/10 border-red-500/20'
      }`}>
        {isLong ? 'L' : 'S'}
      </span>
      <span className="text-xs text-slate-300 font-medium">{trade.symbol}</span>
      <span className="text-[10px] text-slate-400 font-mono truncate flex-1">
        {trade.entry.toFixed(trade.entry < 10 ? 4 : 2)}
        {trade.exit_price != null && ` → ${trade.exit_price.toFixed(trade.exit_price < 10 ? 4 : 2)}`}
      </span>
      <span className={`shrink-0 text-xs font-mono font-medium ${pnlColor}`}>
        {trade.pnl != null ? `${trade.pnl >= 0 ? '+' : ''}$${Math.abs(trade.pnl).toFixed(2)}` : 'Open'}
      </span>
    </div>
  )
}

// ── Day Detail Panel ──────────────────────────────────────────────────────────

function DayDetail({
  dateStr, events, eventsLoaded, dayTrades, dayPnl,
}: {
  dateStr: string
  events: CalendarEvent[]
  eventsLoaded: boolean
  dayTrades: Trade[]
  dayPnl: number
}): JSX.Element {
  const user           = useAuthStore(s => s.user)
  const notes          = useCalendarStore(s => s.notes)
  const saveNote       = useCalendarStore(s => s.saveNote)
  const devToolsEnabled = useSettingsStore(s => s.devToolsEnabled)

  const [localText,  setLocalText]  = useState(notes[dateStr]?.notes ?? '')
  const [noteOpen,   setNoteOpen]   = useState(!!(notes[dateStr]?.notes?.trim()))
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const saveRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const existing = notes[dateStr]?.notes ?? ''
    setLocalText(existing)
    setNoteOpen(!!existing.trim())
    setSaveStatus('idle')
  }, [dateStr]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (text: string) => {
    setLocalText(text)
    setSaveStatus('idle')
    if (saveRef.current) clearTimeout(saveRef.current)
    saveRef.current = setTimeout(async () => {
      if (!user?.id) return
      setSaveStatus('saving')
      const res = await saveNote(user.id, dateStr, text)
      setSaveStatus(res.ok ? 'saved' : 'idle')
    }, 1200)
  }

  const date           = new Date(dateStr + 'T12:00:00')
  const sessions       = getMarketSessions(date)
  const dayName        = date.toLocaleDateString('en-US', { weekday: 'long' })
  const dateLabel      = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const isWeekend      = [0, 6].includes(date.getDay())
  const holidayEvents  = events.filter(e => e.impact === 'Holiday')
  const isMarketClosed = isWeekend || holidayEvents.length > 0
  const dayId          = dayIdFromStr(dateStr)

  const pnlColor = dayPnl > 0 ? 'text-emerald-400' : dayPnl < 0 ? 'text-red-400' : 'text-slate-400'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-glass/40 shrink-0 bg-white/[0.02]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] text-slate-500 uppercase tracking-[0.14em] mb-0.5">{dayName}</p>
            <h2 className="text-slate-100 text-sm font-semibold leading-tight">{dateLabel}</h2>
            {dayTrades.length > 0 && (
              <p className={`text-base font-bold mt-1 tabular-nums ${pnlColor}`}>{fmtPnl(dayPnl)}</p>
            )}
            {isWeekend && <p className="text-[9px] text-slate-600 mt-1">Weekend — markets closed</p>}
          </div>
          <button
            onClick={() => setNoteOpen(o => !o)}
            className={`shrink-0 flex items-center gap-1.5 text-[11px] px-2 py-1.5 rounded-lg border transition-all ${
              noteOpen
                ? 'bg-blue-500/15 text-blue-400 border-blue-500/25'
                : 'bg-white/[0.03] text-slate-500 border-white/[0.06] hover:text-slate-200 hover:bg-white/[0.06]'
            }`}
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="shrink-0">
              <path d="M2 9.5h1.5l4.5-4.5-1.5-1.5L2 8V9.5zM9.5 3a.707.707 0 0 0 0-1L8.5 1a.707.707 0 0 0-1 0L6.5 2l1.5 1.5L9.5 3z" fill="currentColor" />
            </svg>
            Note
          </button>
        </div>

        {noteOpen && (
          <div className="mt-3 flex flex-col gap-1">
            <div className="flex items-center justify-end h-4">
              <span className={`text-[10px] transition-opacity duration-300 ${
                saveStatus === 'saving' ? 'text-slate-400 opacity-100' :
                saveStatus === 'saved'  ? 'text-emerald-500 opacity-100' : 'opacity-0'
              }`}>
                {saveStatus === 'saving' ? 'Saving…' : 'Saved'}
              </span>
            </div>
            <textarea
              autoFocus
              rows={4}
              value={localText}
              onChange={e => handleChange(e.target.value)}
              placeholder={`Notes for ${dateLabel}…`}
              className="w-full bg-white/[0.04] backdrop-blur-sm border border-white/[0.07] rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/30 focus:bg-white/[0.06] transition-all resize-none leading-relaxed"
            />
          </div>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 px-4 py-4 flex flex-col gap-3.5 overflow-y-auto">

        {/* Market Sessions */}
        {!isWeekend && (
          <section>
            <p className="text-[9px] text-slate-600 uppercase tracking-[0.14em] mb-1.5">Sessions</p>
            <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-xl px-4 py-1">
              <SessionRow label="London Open"  time={sessions.london}  timezone={isInBST(date) ? 'BST' : 'GMT'} />
              <SessionRow label="New York Open" time={sessions.newYork} timezone={isInEDT(date) ? 'EDT' : 'EST'} />
            </div>
          </section>
        )}

        {/* Trades */}
        {dayTrades.length > 0 && (
          <section>
            <p className="text-[9px] text-slate-600 uppercase tracking-[0.14em] mb-1.5">
              Trades
              <span className="ml-1.5 text-slate-600 normal-case tracking-normal font-normal">{dayTrades.length}</span>
            </p>
            <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-xl px-4 py-1 max-h-56 overflow-y-auto">
              {dayTrades.map(t => <TradeRow key={t.id} trade={t} />)}
            </div>
          </section>
        )}

        {/* Economic Events */}
        <section>
          <p className="text-[9px] text-slate-600 uppercase tracking-[0.14em] mb-1.5">
            Events
            {events.length > 0 && (
              <span className="ml-1.5 text-slate-600 normal-case tracking-normal font-normal">{events.length}</span>
            )}
          </p>
          <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-xl px-4 py-1">
            {isMarketClosed && (
              <div className="flex items-center justify-between py-2 border-b border-white/[0.05]">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400/80 shrink-0" />
                  <div>
                    <div className="text-xs text-slate-400 font-medium">Markets closed</div>
                    <div className="text-[9px] text-slate-600 uppercase tracking-wide">
                      {isWeekend ? 'Weekend' : holidayEvents.map(h => h.title).join(', ')}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {!eventsLoaded ? (
              <p className="text-[11px] text-slate-500 py-3">Loading…</p>
            ) : events.length === 0 ? (
              <p className="text-[11px] text-slate-600 py-3">No high/medium impact events.</p>
            ) : (
              events.map((e, i) => <EventItem key={i} event={e} />)
            )}
          </div>
        </section>

        {/* DevTools Day ID */}
        {devToolsEnabled && (
          <section>
            <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-1.5">Dev</p>
            <div className="bg-surface-1 border border-glass/30 rounded-xl px-4 py-3">
              <p className="text-[10px] text-slate-600 mb-0.5">Day ID</p>
              <p className="font-mono text-sm text-slate-400 select-all">{dayId}</p>
            </div>
          </section>
        )}

      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CalendarPage(): JSX.Element {
  const user                    = useAuthStore(s => s.user)
  const { notes, fetchNotes }   = useCalendarStore()
  const { trades, fetchTrades } = useTradesStore()

  const today        = new Date()
  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1)
  const [selected,  setSelected]  = useState<string | null>(todayStr())
  const [allEvents, setAllEvents] = useState<Record<string, CalendarEvent[]>>({})
  const [eventsLoaded, setEventsLoaded] = useState(false)

  useEffect(() => {
    if (user?.id) fetchTrades(user.id)
  }, [user?.id, fetchTrades])

  useEffect(() => {
    setEventsLoaded(false)
    const weeks = buildWeeks(viewYear, viewMonth)
    const allDates = weeks.flat().map(d => d.dateStr).sort()
    fetchCalendarEventsGrouped(allDates[0]!, allDates[allDates.length - 1]!)
      .then(setAllEvents)
      .catch(() => setAllEvents({}))
      .finally(() => setEventsLoaded(true))
  }, [viewYear, viewMonth])

  useEffect(() => {
    if (!user?.id) return
    fetchNotes(user.id, viewYear, viewMonth)
    const prev = viewMonth === 1  ? { y: viewYear - 1, m: 12 } : { y: viewYear,     m: viewMonth - 1 }
    const next = viewMonth === 12 ? { y: viewYear + 1, m: 1  } : { y: viewYear,     m: viewMonth + 1 }
    fetchNotes(user.id, prev.y, prev.m)
    fetchNotes(user.id, next.y, next.m)
  }, [user?.id, viewYear, viewMonth, fetchNotes])

  const prevMonth = useCallback(() => {
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12) }
    else setViewMonth(m => m - 1)
  }, [viewMonth])

  const nextMonth = useCallback(() => {
    if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1) }
    else setViewMonth(m => m + 1)
  }, [viewMonth])

  // Group trades by date (opened_at)
  const tradesByDate = trades.reduce<Record<string, Trade[]>>((acc, t) => {
    const d = tradeDateStr(t)
    if (!acc[d]) acc[d] = []
    acc[d].push(t)
    return acc
  }, {})

  const dayPnl = (dateStr: string): number => {
    const ts = tradesByDate[dateStr] ?? []
    return ts.reduce((sum, t) => sum + (t.pnl ?? 0), 0)
  }

  const today_str  = todayStr()
  // Filter out weeks that are entirely padding (no current-month days)
  const weeks      = buildWeeks(viewYear, viewMonth).filter(w => w.some(d => d.isCurrentMonth))
  const dayEvents  = selected ? (allEvents[selected] ?? []) : []
  const dayTrades  = selected ? (tradesByDate[selected] ?? []) : []
  const selDayPnl  = selected ? dayPnl(selected) : 0

  return (
    <Layout>
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

        {/* Header */}
        <div className="px-5 pt-3.5 pb-3 border-b border-glass/40 shrink-0 flex items-center justify-between bg-white/[0.01]">
          <div className="flex items-center gap-2">
            <button
              onClick={prevMonth}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7.5 2.5 4 6l3.5 3.5"/>
              </svg>
            </button>
            <h1 className="text-slate-100 font-semibold text-sm w-40 text-center tracking-wide">
              {MONTHS[viewMonth - 1]} {viewYear}
            </h1>
            <button
              onClick={nextMonth}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.5 2.5 8 6l-3.5 3.5"/>
              </svg>
            </button>
          </div>
          <button
            onClick={() => { setSelected(todayStr()); setViewYear(today.getFullYear()); setViewMonth(today.getMonth() + 1) }}
            className="text-[11px] text-slate-500 hover:text-slate-200 px-3 py-1.5 rounded-lg border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.04] transition-all"
          >
            Today
          </button>
        </div>

        {/* Main content */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Weekly grid */}
          <div className="flex-1 overflow-y-auto">
            <div className="min-w-0 h-full flex flex-col">

              {/* Column headers */}
              <div
                className="shrink-0 border-b border-glass/30"
                style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr)) 80px' }}
              >
                {DOW_LONG.map(d => (
                  <div key={d} className="px-2 py-2 text-[9px] font-semibold uppercase tracking-widest text-slate-600">
                    {d.slice(0, 3)}
                  </div>
                ))}
                <div className="px-2 py-2 text-[9px] font-semibold uppercase tracking-widest text-slate-700">
                  Total
                </div>
              </div>

              {/* Week rows — equal height, fill available space */}
              <div className="flex-1 flex flex-col">
                {weeks.map((week, wi) => {
                  const currentDays    = week.filter(d => d.isCurrentMonth)
                  const weekTotalPnl   = currentDays.reduce((sum, d) => sum + dayPnl(d.dateStr), 0)
                  const weekTotalTrades = currentDays.reduce((sum, d) => sum + (tradesByDate[d.dateStr]?.length ?? 0), 0)

                  return (
                    <div
                      key={wi}
                      className="flex-1 border-b border-glass/20 last:border-0"
                      style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr)) 80px', minHeight: 72 }}
                    >
                      {week.map(cell => (
                        <DayGridCell
                          key={cell.dateStr}
                          {...cell}
                          isToday={cell.dateStr === today_str}
                          isSelected={cell.dateStr === selected}
                          pnl={dayPnl(cell.dateStr)}
                          tradeCount={tradesByDate[cell.dateStr]?.length ?? 0}
                          hasNote={!!(notes[cell.dateStr]?.notes?.trim())}
                          hasEvent={!!(allEvents[cell.dateStr]?.length)}
                          onClick={() => setSelected(cell.dateStr)}
                        />
                      ))}
                      <WeekTotalCell
                        weekIndex={wi}
                        totalPnl={weekTotalPnl}
                        totalTrades={weekTotalTrades}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Day detail panel — glassmorphism */}
          {selected && (
            <div className="w-80 xl:w-96 shrink-0 border-l border-glass/40 overflow-hidden flex flex-col bg-white/[0.015] backdrop-blur-sm">
              <DayDetail
                dateStr={selected}
                events={dayEvents}
                eventsLoaded={eventsLoaded}
                dayTrades={dayTrades}
                dayPnl={selDayPnl}
              />
            </div>
          )}

        </div>
      </div>
    </Layout>
  )
}
