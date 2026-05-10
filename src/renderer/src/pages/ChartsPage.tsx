import { useEffect, useRef, useState } from 'react'
import Layout from '@renderer/components/Layout'
import ChartPanel from '@renderer/components/chart/ChartPanel'
import ConfidenceMeter from '@renderer/components/ConfidenceMeter'
import EconomicCalendar from '@renderer/components/EconomicCalendar'
import ErrorBoundary from '@renderer/components/ErrorBoundary'
import { useChartStore } from '@renderer/store/chartStore'
import { useAuthStore } from '@renderer/store/authStore'
import { useMarketStore } from '@renderer/store/marketStore'
import { getRefreshMs, msUntilNextCandleClose } from '@renderer/lib/intervals'
import { fetchCalendarEvents } from '@renderer/lib/calendar'
import TradeJournal from '@renderer/components/TradeJournal'
import { useFavoritesStore } from '@renderer/store/favoritesStore'

export default function ChartsPage(): JSX.Element {
  const user              = useAuthStore((s) => s.user)
  const { symbol, interval, sessionLoaded, loadSession } = useChartStore()
  const refresh           = useMarketStore((s) => s.refresh)
  const setNextRefreshAt  = useMarketStore((s) => s.setNextRefreshAt)
  const setCalendarEvents = useMarketStore((s) => s.setCalendarEvents)
  const fetchFavorites    = useFavoritesStore(s => s.fetch)
  const [journalOpen, setJournalOpen] = useState(true)

  useEffect(() => {
    if (user?.id) { loadSession(user.id); fetchFavorites(user.id) }
  }, [user?.id, loadSession, fetchFavorites])

  useEffect(() => {
    const load = () =>
      fetchCalendarEvents()
        .then((ev) => setCalendarEvents(ev, symbol))
        .catch((err) => console.warn('[Calendar] fetch failed:', err))
    load()
    const id = setInterval(load, 4 * 3_600_000)
    return () => clearInterval(id)
  }, [symbol, setCalendarEvents])

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!sessionLoaded) return

    const clearTimers = () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (timeoutRef.current)  clearTimeout(timeoutRef.current)
    }

    clearTimers()
    refresh(symbol, interval)

    const refreshMs    = getRefreshMs(interval)
    const initialDelay = msUntilNextCandleClose(interval)
    setNextRefreshAt(Date.now() + initialDelay)

    timeoutRef.current = setTimeout(() => {
      refresh(symbol, interval)
      setNextRefreshAt(Date.now() + refreshMs)
      intervalRef.current = setInterval(() => {
        refresh(symbol, interval)
        setNextRefreshAt(Date.now() + refreshMs)
      }, refreshMs)
    }, initialDelay)

    return clearTimers
  }, [symbol, interval, sessionLoaded, refresh])

  const rightRail = (
    <div className="flex flex-col gap-2 py-3">
      <ErrorBoundary label="ConfidenceMeter">
        <ConfidenceMeter />
      </ErrorBoundary>
      <div className="mx-4 border-t border-white/[0.06]" />
      <ErrorBoundary label="EconomicCalendar">
        <EconomicCalendar />
      </ErrorBoundary>
    </div>
  )

  return (
    <Layout rightRail={rightRail}>
      <div className="flex flex-col flex-1 min-h-0">
        <ErrorBoundary label="ChartPanel">
          <ChartPanel />
        </ErrorBoundary>
      </div>
      <TradeJournal journalOpen={journalOpen} onToggle={() => setJournalOpen(j => !j)} />
    </Layout>
  )
}
