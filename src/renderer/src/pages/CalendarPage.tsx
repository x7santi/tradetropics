import { useEffect, useState, useRef, useCallback } from 'react'
import Layout from '@renderer/components/Layout'
import { useAuthStore }    from '@renderer/store/authStore'
import { useCalendarStore } from '@renderer/store/calendarStore'
import { useTradesStore, type Trade } from '@renderer/store/tradesStore'
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

function tradeDateStr(iso: string): string {
  return iso.split('T')[0]
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const DOW = ['Su','Mo','Tu','We','Th','Fr','Sa']

function formatSessionTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatEventTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DayCell({
  day, isCurrentMonth, isToday, isSelected, hasNote, hasEvent, hasTrade, onClick,
}: {
  day: number
  isCurrentMonth: boolean
  isToday: boolean
  isSelected: boolean
  hasNote: boolean
  hasEvent: boolean
  hasTrade: boolean
  onClick: () => void
}): JSX.Element {
  // Hide out-of-month cells — render invisible placeholder to preserve grid
  if (!isCurrentMonth) {
    return <div />
  }

  return (
    <button
      onClick={onClick}
      className={`
        relative flex flex-col items-center justify-start pt-1.5 h-10 w-full rounded-lg text-xs font-medium transition-all duration-100
        ${hasEvent ? 'text-slate-100' : 'text-slate-500'}
        ${isSelected ? 'bg-blue-500/15 !text-blue-400 ring-1 ring-blue-500/30' : 'hover:bg-white/[0.04]'}
        ${isToday && !isSelected ? 'ring-1 ring-blue-500/40 !text-blue-400' : ''}
      `}
    >
      <span>{day}</span>
      {/* Note + trade dots only — no event dot */}
      {(hasNote || hasTrade) && (
        <div className="flex gap-0.5 mt-0.5">
          {hasNote  && <span className="w-1 h-1 rounded-full bg-blue-400" />}
          {hasTrade && <span className="w-1 h-1 rounded-full bg-emerald-400" />}
        </div>
      )}
    </button>
  )
}

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
  const isLong = trade.direction === 'long'
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
      <span className="text-[10px] text-slate-400 font-mono">
        {trade.entry.toFixed(trade.entry < 10 ? 4 : 2)}
        {trade.exit_price != null && ` → ${trade.exit_price.toFixed(trade.exit_price < 10 ? 4 : 2)}`}
      </span>
      <span className={`ml-auto text-xs font-mono font-medium ${pnlColor}`}>
        {trade.pnl != null ? `${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}` : 'Open'}
      </span>
    </div>
  )
}

// ── Day Detail Panel ──────────────────────────────────────────────────────────

function DayDetail({
  dateStr, events, eventsLoaded, dayTrades,
}: {
  dateStr: string
  events: CalendarEvent[]
  eventsLoaded: boolean
  dayTrades: Trade[]
}): JSX.Element {
  const user     = useAuthStore(s => s.user)
  const notes    = useCalendarStore(s => s.notes)
  const saveNote = useCalendarStore(s => s.saveNote)

  const [localText,  setLocalText]  = useState(notes[dateStr]?.notes ?? '')
  const [noteOpen,   setNoteOpen]   = useState(!!(notes[dateStr]?.notes?.trim()))
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const saveRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset state when selected day changes
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

  const date     = new Date(dateStr + 'T12:00:00')
  const sessions = getMarketSessions(date)
  const dayName  = date.toLocaleDateString('en-US', { weekday: 'long' })
  const dateLabel= date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const isWeekend= [0, 6].includes(date.getDay())
  const holidayEvents  = events.filter(e => e.impact === 'Holiday')
  const isMarketClosed = isWeekend || holidayEvents.length > 0

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-glass shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-0.5">{dayName}</p>
            <h2 className="text-slate-100 text-lg font-semibold">{dateLabel}</h2>
            {isWeekend && <p className="text-[10px] text-slate-400 mt-1">Markets closed on weekends</p>}
          </div>
          <button
            onClick={() => setNoteOpen(o => !o)}
            className={`shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
              noteOpen
                ? 'bg-blue-500/15 text-blue-400 border-blue-500/25'
                : 'bg-white/[0.04] text-slate-400 border-glass hover:text-slate-200 hover:bg-white/[0.06]'
            }`}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="shrink-0">
              <path d="M2 9.5h1.5l4.5-4.5-1.5-1.5L2 8V9.5zM9.5 3a.707.707 0 0 0 0-1L8.5 1a.707.707 0 0 0-1 0L6.5 2l1.5 1.5L9.5 3z"
                fill="currentColor" />
            </svg>
            Take Note
          </button>
        </div>

        {/* Collapsible note box — opens at the top */}
        {noteOpen && (
          <div className="mt-4 flex flex-col gap-1.5">
            <div className="flex items-center justify-end h-4">
              <span className={`text-[10px] transition-opacity duration-300 ${
                saveStatus === 'saving' ? 'text-slate-400 opacity-100' :
                saveStatus === 'saved'  ? 'text-emerald-500 opacity-100' :
                'opacity-0'
              }`}>
                {saveStatus === 'saving' ? 'Saving…' : 'Saved'}
              </span>
            </div>
            <textarea
              autoFocus
              rows={6}
              value={localText}
              onChange={e => handleChange(e.target.value)}
              placeholder={`Notes for ${dateLabel}…\n\nMarket structure, bias, setups watched, lessons learned.`}
              className="w-full bg-surface-base border border-glass rounded-xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/40 transition-colors resize-none leading-relaxed"
            />
          </div>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 px-6 py-4 flex flex-col gap-5 overflow-y-auto">

        {/* Market Sessions */}
        {!isWeekend && (
          <section>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-2">Market Sessions (your local time)</p>
            <div className="bg-surface-1 border border-glass rounded-xl px-4 py-1">
              <SessionRow label="London Open"  time={sessions.london}  timezone={isInBST(date) ? 'BST' : 'GMT'} />
              <SessionRow label="New York Open" time={sessions.newYork} timezone={isInEDT(date) ? 'EDT' : 'EST'} />
            </div>
          </section>
        )}

        {/* Trades */}
        {dayTrades.length > 0 && (
          <section>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-2">
              Trades
              <span className="ml-2 text-slate-500 normal-case tracking-normal">{dayTrades.length} logged</span>
            </p>
            <div className="bg-surface-1 border border-glass rounded-xl px-4 py-1">
              {dayTrades.map(t => <TradeRow key={t.id} trade={t} />)}
            </div>
          </section>
        )}

        {/* Economic Events */}
        <section>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-2">
            Economic Events
            {events.length > 0 && (
              <span className="ml-2 text-slate-400 normal-case tracking-normal">
                {events.length} event{events.length !== 1 ? 's' : ''}
              </span>
            )}
          </p>
          <div className="bg-surface-1 border border-glass rounded-xl px-4 py-1">
            {isMarketClosed && (
              <div className="flex items-center justify-between py-2 border-b border-glass/50">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-400/80 shrink-0" />
                  <div>
                    <div className="text-sm text-slate-300 font-medium">Markets closed</div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                      {isWeekend ? 'Weekend' : holidayEvents.map(h => h.title).join(', ')}
                    </div>
                  </div>
                </div>
                <span className="text-sm font-mono text-slate-200">—</span>
              </div>
            )}
            {!eventsLoaded ? (
              <p className="text-xs text-slate-400 py-3">Loading events…</p>
            ) : events.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">No high/medium impact events for this date.</p>
            ) : (
              events.map((e, i) => <EventItem key={i} event={e} />)
            )}
          </div>
        </section>

      </div>
    </div>
  )
}

// ── Month Grid ────────────────────────────────────────────────────────────────

function buildCalendarDays(year: number, month: number): { dateStr: string; day: number; isCurrentMonth: boolean }[] {
  const firstDay   = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const prevDays   = new Date(year, month - 1, 0).getDate()
  const cells: { dateStr: string; day: number; isCurrentMonth: boolean }[] = []

  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevDays - i
    const pm = month === 1 ? 12 : month - 1
    const py = month === 1 ? year - 1 : year
    cells.push({ dateStr: toDateStr(py, pm, d), day: d, isCurrentMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ dateStr: toDateStr(year, month, d), day: d, isCurrentMonth: true })
  }
  const remaining = 42 - cells.length
  for (let d = 1; d <= remaining; d++) {
    const nm = month === 12 ? 1 : month + 1
    const ny = month === 12 ? year + 1 : year
    cells.push({ dateStr: toDateStr(ny, nm, d), day: d, isCurrentMonth: false })
  }
  return cells
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CalendarPage(): JSX.Element {
  const user                      = useAuthStore(s => s.user)
  const { notes, fetchNotes }     = useCalendarStore()
  const { trades, fetchTrades }   = useTradesStore()

  const today        = new Date()
  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1)
  const [selected,  setSelected]  = useState<string>(todayStr())
  const [allEvents, setAllEvents] = useState<Record<string, CalendarEvent[]>>({})
  const [eventsLoaded, setEventsLoaded] = useState(false)

  useEffect(() => {
    if (user?.id) fetchTrades(user.id)
  }, [user?.id, fetchTrades])

  useEffect(() => {
    setEventsLoaded(false)
    const cells  = buildCalendarDays(viewYear, viewMonth)
    const uniq   = [...new Set(cells.map(c => c.dateStr))].sort()
    fetchCalendarEventsGrouped(uniq[0]!, uniq[uniq.length - 1]!)
      .then(setAllEvents)
      .catch(() => setAllEvents({}))
      .finally(() => setEventsLoaded(true))
  }, [viewYear, viewMonth])

  useEffect(() => {
    if (!user?.id) return
    fetchNotes(user.id, viewYear, viewMonth)
    const prev = viewMonth === 1  ? { y: viewYear - 1, m: 12 }      : { y: viewYear, m: viewMonth - 1 }
    const next = viewMonth === 12 ? { y: viewYear + 1, m: 1 }       : { y: viewYear, m: viewMonth + 1 }
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

  // Group trades by date
  const tradesByDate = trades.reduce<Record<string, Trade[]>>((acc, t) => {
    const d = tradeDateStr(t.created_at)
    if (!acc[d]) acc[d] = []
    acc[d].push(t)
    return acc
  }, {})

  const today_str = todayStr()
  const cells     = buildCalendarDays(viewYear, viewMonth)
  const dayEvents = allEvents[selected] ?? []
  const dayTrades = tradesByDate[selected] ?? []

  return (
    <Layout>
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Left: Month Grid ── */}
        <div className="w-72 shrink-0 flex flex-col border-r border-glass bg-surface-1 p-4">

          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={prevMonth}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-colors text-sm"
            >‹</button>
            <p className="text-sm font-semibold text-slate-200">
              {MONTHS[viewMonth - 1]} {viewYear}
            </p>
            <button
              onClick={nextMonth}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-colors text-sm"
            >›</button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 mb-1">
            {DOW.map(d => (
              <p key={d} className="text-center text-[10px] text-slate-400 py-1">{d}</p>
            ))}
          </div>

          {/* Day cells — off-month cells render as invisible placeholders */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map(({ dateStr, day, isCurrentMonth }) => (
              <DayCell
                key={dateStr}
                day={day}
                isCurrentMonth={isCurrentMonth}
                isToday={dateStr === today_str}
                isSelected={dateStr === selected}
                hasNote={!!(notes[dateStr]?.notes?.trim())}
                hasEvent={!!(allEvents[dateStr]?.length)}
                hasTrade={!!(tradesByDate[dateStr]?.length)}
                onClick={() => { if (isCurrentMonth) setSelected(dateStr) }}
              />
            ))}
          </div>

          {/* Legend */}
          <div className="mt-4 pt-4 border-t border-glass flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <span className="text-slate-100 font-medium">White</span> days have events
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> Day has notes
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Trade logged
            </div>
          </div>
        </div>

        {/* ── Right: Day Detail ── */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {selected ? (
            <DayDetail
              dateStr={selected}
              events={dayEvents}
              eventsLoaded={eventsLoaded}
              dayTrades={dayTrades}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
              Select a day to view details
            </div>
          )}
        </div>

      </div>
    </Layout>
  )
}
