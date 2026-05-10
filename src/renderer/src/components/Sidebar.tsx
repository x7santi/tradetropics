import { useState, useRef, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, BookOpen, Calendar, Settings, User, FileText, Lock, ScrollText, BarChart2, type LucideIcon } from 'lucide-react'
import { useIsPro } from '@renderer/components/ProGate'
import { playMetalClank } from '@renderer/lib/sounds'
import { useReportStore } from '@renderer/store/reportStore'
import { useDevLogStore } from '@renderer/store/devLogStore'
import { useDashboardToolStore } from '@renderer/store/dashboardToolStore'
import { useSettingsStore } from '@renderer/store/settingsStore'

const bottomItems: { to: string; icon: LucideIcon; label: string }[] = [
  { to: '/settings', icon: Settings, label: 'Settings' },
  { to: '/account',  icon: User,     label: 'Account'  },
]

function NavItem({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }): JSX.Element {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `group flex items-center gap-3 px-3 py-2 text-sm font-medium transition-all duration-150 ${
          isActive
            ? 'bg-indigo-500/10 text-indigo-200 shadow-[inset_2px_0_0_#6366f1] rounded-r-lg'
            : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.05] rounded-lg'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={16} className={`shrink-0 transition-colors ${isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
          <span className="hidden lg:block">{label}</span>
        </>
      )}
    </NavLink>
  )
}

function LockedNavItem({ icon: Icon, label, navigate: nav }: { icon: LucideIcon; label: string; navigate: () => void }): JSX.Element {
  const [shaking, setShaking] = useState(false)
  const [glowing, setGlowing] = useState(false)
  const [hovered, setHovered] = useState(false)

  const handleClick = () => {
    if (shaking) return
    playMetalClank()
    setShaking(true)
    setGlowing(true)
    setTimeout(() => setShaking(false), 400)
    setTimeout(() => setGlowing(false), 600)
  }

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`relative w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150
        text-slate-400 hover:text-slate-400 hover:bg-white/[0.03]
        ${shaking ? 'animate-shake' : ''}
        ${glowing ? 'ring-1 ring-red-500/50 shadow-[0_0_12px_rgba(239,68,68,0.35)]' : ''}`}
    >
      <div className="flex items-center gap-3 pointer-events-none select-none blur-sm brightness-75">
        <Icon size={16} className="shrink-0 text-slate-400" />
        <span className="hidden lg:block">{label}</span>
      </div>
      {hovered && <Lock size={15} className="shrink-0 text-red-400 absolute left-3" />}
      {hovered && (
        <span
          onClick={(e) => { e.stopPropagation(); nav() }}
          className="hidden lg:flex absolute right-2 items-center text-[9px] text-blue-400 hover:text-blue-300 transition-colors"
        >
          Upgrade →
        </span>
      )}
    </button>
  )
}

function ReportsNavItem(): JSX.Element {
  const isPro           = useIsPro()
  const navigate        = useNavigate()
  const [navShake, setNavShake]       = useState(false)
  const [reportFlash, setReportFlash] = useState(false)
  const unreadCount      = useReportStore(s => s.unreadCount())
  const newReportSignal  = useReportStore(s => s.newReportSignal)
  const reportGeneration = useReportStore(s => s.reportGeneration)
  const prevSignal           = useRef(newReportSignal)
  const prevGenerationActive = useRef(reportGeneration.active)

  useEffect(() => {
    if (newReportSignal > prevSignal.current) {
      setNavShake(true)
      setTimeout(() => setNavShake(false), 400)
    }
    prevSignal.current = newReportSignal
  }, [newReportSignal])

  useEffect(() => {
    if (reportGeneration.active && !prevGenerationActive.current) {
      setReportFlash(true)
      setTimeout(() => setReportFlash(false), 760)
    }
    prevGenerationActive.current = reportGeneration.active
  }, [reportGeneration.active])

  if (isPro) {
    return (
      <div className={`w-full ${navShake ? 'animate-shake' : ''}`}>
        <NavLink
          to="/reports"
          className={({ isActive }) =>
            `group flex items-center gap-3 px-3 py-2 text-sm font-medium transition-all duration-150 ${
              reportFlash
                ? 'animate-report-flash text-white rounded-r-lg'
                : isActive
                ? 'bg-indigo-500/10 text-indigo-200 shadow-[inset_2px_0_0_#6366f1] rounded-r-lg'
                : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.05] rounded-lg'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <div className="relative shrink-0">
                <FileText size={16} className={`transition-colors ${isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                {unreadCount > 0 && (
                  <span className="lg:hidden absolute -top-1.5 -right-1.5 flex">
                    <span className="animate-ping absolute inline-flex h-3.5 w-3.5 rounded-full bg-blue-400 opacity-40" />
                    <span className="relative flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-500 text-[8px] font-bold text-white leading-none">
                      {unreadCount <= 9 ? unreadCount : '·'}
                    </span>
                  </span>
                )}
              </div>
              <span className="hidden lg:block">Reports</span>
              {unreadCount > 0 && (
                <span className="hidden lg:flex ml-auto items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white px-1.5 h-[18px] min-w-[18px]">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </>
          )}
        </NavLink>
        {reportGeneration.active && (
          <div className="mt-1.5 px-3">
            <div className="h-1 overflow-hidden rounded-full bg-slate-800/80">
              <div
                className="h-full rounded-full bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.65)] transition-[width] duration-100 ease-out"
                style={{ width: `${reportGeneration.progress}%` }}
              />
            </div>
            <div className="hidden lg:flex mt-1 items-center justify-between text-[9px] leading-none text-slate-400">
              <span>Generating report</span>
              <span className="tabular-nums">{Math.round(reportGeneration.progress)}%</span>
            </div>
          </div>
        )}
      </div>
    )
  }

  return <LockedNavItem icon={FileText} label="Reports" navigate={() => navigate('/paywall')} />
}

function JournalNavItem(): JSX.Element {
  const isPro    = useIsPro()
  const navigate = useNavigate()

  if (isPro) {
    return (
      <NavLink
        to="/journal"
        className={({ isActive }) =>
          `group flex items-center gap-3 px-3 py-2 text-sm font-medium transition-all duration-150 ${
            isActive
              ? 'bg-indigo-500/10 text-indigo-200 shadow-[inset_2px_0_0_#6366f1] rounded-r-lg'
              : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.05] rounded-lg'
          }`
        }
      >
        {({ isActive }) => (
          <>
            <BookOpen size={16} className={`shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
            <span className="hidden lg:block">Journal</span>
          </>
        )}
      </NavLink>
    )
  }

  return <LockedNavItem icon={BookOpen} label="Journal" navigate={() => navigate('/paywall')} />
}

function BacktestNavItem(): JSX.Element {
  const isPro    = useIsPro()
  const navigate = useNavigate()

  if (isPro) {
    return (
      <NavLink
        to="/backtest"
        className={({ isActive }) =>
          `group flex items-center gap-3 px-3 py-2 text-sm font-medium transition-all duration-150 ${
            isActive
              ? 'bg-indigo-500/10 text-indigo-200 shadow-[inset_2px_0_0_#6366f1] rounded-r-lg'
              : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.05] rounded-lg'
          }`
        }
      >
        {({ isActive }) => (
          <>
            <BarChart2 size={16} className={`shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
            <span className="hidden lg:block">Backtest</span>
          </>
        )}
      </NavLink>
    )
  }

  return <LockedNavItem icon={BarChart2} label="Backtest" navigate={() => navigate('/paywall')} />
}

function DevLogNavItem(): JSX.Element {
  const location       = useLocation()
  const isActive       = location.pathname === '/devlog'
  const unreadCount    = useDevLogStore(s => s.unreadCount)
  const criticalUnread = useDevLogStore(s => s.criticalUnread)
  const markRead       = useDevLogStore(s => s.markRead)

  useEffect(() => { if (isActive) markRead() }, [isActive, markRead])

  const badgeColor = criticalUnread ? 'bg-red-500' : 'bg-blue-500'
  const pingColor  = criticalUnread ? 'bg-red-400' : 'bg-blue-400'

  return (
    <NavLink
      to="/devlog"
      onClick={markRead}
      className={({ isActive: a }) =>
        `group flex items-center gap-3 px-3 py-2 text-sm font-medium transition-all duration-150 ${
          a
            ? 'bg-indigo-500/10 text-indigo-200 shadow-[inset_2px_0_0_#6366f1] rounded-r-lg'
            : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.05] rounded-lg'
        }`
      }
    >
      {({ isActive: a }) => (
        <>
          <div className="relative shrink-0">
            <ScrollText size={16} className={`transition-colors ${a ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
            {unreadCount > 0 && (
              <span className="lg:hidden absolute -top-1.5 -right-1.5 flex">
                <span className={`animate-ping absolute inline-flex h-3.5 w-3.5 rounded-full ${pingColor} opacity-40`} />
                <span className={`relative flex h-3.5 w-3.5 items-center justify-center rounded-full ${badgeColor} text-[8px] font-bold text-white leading-none`}>
                  {unreadCount <= 9 ? unreadCount : '·'}
                </span>
              </span>
            )}
          </div>
          <span className="hidden lg:block">Log</span>
          {unreadCount > 0 && (
            <span className={`hidden lg:flex ml-auto items-center justify-center rounded-full ${badgeColor} text-[9px] font-bold text-white px-1.5 h-[18px] min-w-[18px]`}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

function DashboardNavItem({ isDashboard, activeTools, toggleTool }: {
  isDashboard: boolean
  activeTools: string[]
  toggleTool: (tool: string) => void
}): JSX.Element {
  return (
    <div>
      <NavLink
        to="/dashboard"
        className={({ isActive }) =>
          `group flex items-center gap-3 px-3 py-2 text-sm font-medium transition-all duration-150 ${
            isActive
              ? 'bg-indigo-500/10 text-indigo-200 shadow-[inset_2px_0_0_#6366f1] rounded-r-lg'
              : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.05] rounded-lg'
          }`
        }
      >
        {({ isActive }) => (
          <>
            <LayoutDashboard size={16} className={`shrink-0 transition-colors ${isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
            <span className="hidden lg:block">Dashboard</span>
          </>
        )}
      </NavLink>
      {isDashboard && (
        <div className="mt-1 ml-3 flex flex-col gap-0.5">
          {[
            { key: 'score',    label: 'AI Score', short: 'A' },
            { key: 'calendar', label: 'Calendar', short: 'C' },
            { key: 'journal',  label: 'Journal',  short: 'J' },
            { key: 'news',     label: 'News',     short: 'N' },
          ].map(({ key, label, short }) => (
            <button
              key={key}
              onClick={() => toggleTool(key)}
              title={`Toggle ${label}`}
              className={`w-full flex items-center justify-center lg:justify-start text-xs px-3 py-2 rounded-lg transition-colors ${
                activeTools.includes(key)
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.05]'
              }`}
            >
              <span className="hidden lg:inline">{label}</span>
              <span className="lg:hidden text-[10px]">{short}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Sidebar(): JSX.Element {
  const location        = useLocation()
  const isDashboard     = location.pathname === '/dashboard'
  const activeTools     = useDashboardToolStore(s => s.activeTools)
  const toggleTool      = useDashboardToolStore(s => s.toggleTool)
  const devToolsEnabled = useSettingsStore(s => s.devToolsEnabled)
  const isPro           = useIsPro()

  return (
    <aside className="flex flex-col w-14 lg:w-48 bg-surface-1 border-r border-glass shrink-0 h-full">

      {/* Brand */}
      <div
        className="flex items-center h-14 px-4 shrink-0 border-b border-glass"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.025) 0%, transparent 100%)' }}
      >
        <div className="flex items-center gap-2.5">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" className="shrink-0">
            <rect width="22" height="22" rx="6" fill="rgba(99,102,241,0.14)"/>
            <path d="M4 11 C6 11 7 8 9 8 C11 8 12 14 14 14 C16 14 17 11 18 11"
              stroke="#818cf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="text-slate-100 font-semibold text-sm tracking-tight hidden lg:block">
            TradeTropics
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 p-2 flex-1 pt-3">
        {isPro ? (
          /* Pro order: Dashboard, Backtest, Journal, Calendar, Reports */
          <>
            <DashboardNavItem isDashboard={isDashboard} activeTools={activeTools} toggleTool={toggleTool} />
            <BacktestNavItem />
            <JournalNavItem />
            <NavItem to="/calendar" icon={Calendar} label="Calendar" />
            <ReportsNavItem />
          </>
        ) : (
          /* Free order: available first (Dashboard, Calendar), then locked (Backtest, Journal, Reports) */
          <>
            <DashboardNavItem isDashboard={isDashboard} activeTools={activeTools} toggleTool={toggleTool} />
            <NavItem to="/calendar" icon={Calendar} label="Calendar" />
            <BacktestNavItem />
            <JournalNavItem />
            <ReportsNavItem />
          </>
        )}

        <div className="flex-1" />

        {devToolsEnabled && <DevLogNavItem />}

        {bottomItems.map(item => <NavItem key={item.to} {...item} />)}
      </nav>

      {/* Version */}
      <div className="hidden lg:block px-4 py-3 border-t border-glass">
        <p className="text-[10px] font-mono text-slate-700 tracking-wide">v{__APP_VERSION__}</p>
      </div>

    </aside>
  )
}
