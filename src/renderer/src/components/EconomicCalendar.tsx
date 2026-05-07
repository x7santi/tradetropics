import { useEffect, useMemo, useState } from 'react'
import { useMarketStore } from '@renderer/store/marketStore'
import { useChartStore } from '@renderer/store/chartStore'
import { filterDashboardCalendarEvents } from '@renderer/lib/confidence'

function formatCountdown(ts: number, now: number): string {
  const diff = ts - now
  if (diff < -60_000) return 'released'
  if (diff < 0)       return 'now'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `in ${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `in ${h}h ${m}m` : `in ${h}h`
}

export default function EconomicCalendar(): JSX.Element {
  const allEvents = useMarketStore((s) => s.calendarEvents)
  const symbol    = useChartStore((s) => s.symbol)
  const [now, setNow] = useState(Date.now())

  const events = useMemo(
    () => filterDashboardCalendarEvents(allEvents, symbol, now),
    [allEvents, symbol, now],
  )

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="px-3 pb-4">
      <div className="mb-3">
        <p className="text-xs text-slate-400 uppercase tracking-wider">Economic Calendar</p>
        <p className="text-[10px] text-slate-400 mt-0.5">Releases relevant to {symbol} · next 72h</p>
      </div>

      {events.length === 0 ? (
        <p className="text-slate-600 text-xs">
          No high/medium-impact events for {symbol} in the next 72 hours
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {events.slice(0, 6).map((event) => {
            const countdown  = formatCountdown(event.timestamp, now)
            const isImminent = event.timestamp - now < 30 * 60_000 && event.timestamp > now
            const isPast     = event.timestamp < now - 60_000
            const rowKey     = `${event.timestamp}|${event.country}|${event.title}`

            return (
              <div
                key={rowKey}
                className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-opacity ${
                  isPast ? 'opacity-35' : 'bg-surface-2/60'
                }`}
              >
                <div
                  className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                    isImminent ? 'animate-pulse bg-rose-400' : isPast ? 'bg-slate-700' : 'bg-rose-400/60'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-300 leading-snug truncate">{event.title}</p>
                  <p className={`text-xs mt-0.5 ${isImminent ? 'text-rose-400' : 'text-slate-400'}`}>
                    {event.country} · {countdown}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
