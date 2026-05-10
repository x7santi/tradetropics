import { useEffect, useRef } from 'react'
import Layout from '@renderer/components/Layout'
import ChartPanel from '@renderer/components/chart/ChartPanel'
import ConfidenceMeter from '@renderer/components/ConfidenceMeter'
import EconomicCalendar from '@renderer/components/EconomicCalendar'
import NewsPanel from '@renderer/components/NewsPanel'
import ErrorBoundary from '@renderer/components/ErrorBoundary'
import { useChartStore } from '@renderer/store/chartStore'
import { useAuthStore } from '@renderer/store/authStore'
import { useMarketStore } from '@renderer/store/marketStore'
import { getRefreshMs, msUntilNextCandleClose } from '@renderer/lib/intervals'
import { fetchCalendarEvents } from '@renderer/lib/calendar'
import TradeJournal from '@renderer/components/TradeJournal'
import { useFavoritesStore } from '@renderer/store/favoritesStore'
import { useDashboardToolStore, type ActiveDashboardTool } from '@renderer/store/dashboardToolStore'

function Divider(): JSX.Element {
  return <div className="mx-4 border-t border-slate-800" />
}

function RightRail({ activeTools }: { activeTools: ActiveDashboardTool[] }): JSX.Element {
  const hasScore    = activeTools.includes('score')
  const hasCalendar = activeTools.includes('calendar')
  const hasNews     = activeTools.includes('news')

  return (
    <div className="flex flex-col gap-2 py-3">
      {hasScore && (
        <ErrorBoundary label="ConfidenceMeter">
          <ConfidenceMeter />
        </ErrorBoundary>
      )}
      {hasScore && hasCalendar && <Divider />}
      {hasCalendar && (
        <ErrorBoundary label="EconomicCalendar">
          <EconomicCalendar />
        </ErrorBoundary>
      )}
      {(hasScore || hasCalendar) && hasNews && <Divider />}
      {hasNews && (
        <ErrorBoundary label="NewsPanel">
          <NewsPanel />
        </ErrorBoundary>
      )}
    </div>
  )
}

export default function DashboardPage(): JSX.Element {
  const user = useAuthStore((s) => s.user)
  const { symbol, interval, sessionLoaded, loadSession } = useChartStore()
  const refresh = useMarketStore((s) => s.refresh)
  const setNextRefreshAt = useMarketStore((s) => s.setNextRefreshAt)
  const setCalendarEvents = useMarketStore((s) => s.setCalendarEvents)

  const fetchFavorites = useFavoritesStore(s => s.fetch)
  const activeTools = useDashboardToolStore(s => s.activeTools)
  const toggleTool = useDashboardToolStore(s => s.toggleTool)
  const railTools    = activeTools.filter(tool => tool === 'score' || tool === 'calendar' || tool === 'news')
  const journalOpen  = activeTools.includes('journal')

  useEffect(() => {
    if (user?.id) { loadSession(user.id); fetchFavorites(user.id) }
  }, [user?.id, loadSession, fetchFavorites])

  // Macro calendar: same feed for all pairs, but score + sidebar filter by active `symbol`
  useEffect(() => {
    const load = () =>
      fetchCalendarEvents()
        .then((ev) => setCalendarEvents(ev, symbol))
        .catch((err) => console.warn('[Calendar] fetch failed:', err))
    load()
    const id = setInterval(load, 4 * 3_600_000)
    return () => clearInterval(id)
  }, [symbol, setCalendarEvents])

  // Market data polling aligned to candle closures (for confidence meter)
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

  return (
    <Layout
      rightRail={railTools.length > 0 ? <RightRail activeTools={activeTools} /> : undefined}
    >
      <div className="flex flex-col flex-1 min-h-0">
        <ErrorBoundary label="ChartPanel">
          <ChartPanel />
        </ErrorBoundary>
      </div>

      {journalOpen && <TradeJournal journalOpen={journalOpen} onToggle={() => toggleTool('journal')} />}
    </Layout>
  )
}
