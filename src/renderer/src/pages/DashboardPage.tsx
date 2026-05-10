import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LineChart, BookOpen, Calendar, FileText, BarChart2,
  Settings, TrendingUp, TrendingDown, Minus, type LucideIcon,
} from 'lucide-react'
import Layout from '@renderer/components/Layout'
import { useAuthStore } from '@renderer/store/authStore'
import { useTradesStore } from '@renderer/store/tradesStore'
import { useIsPro } from '@renderer/components/ProGate'
import { supabase } from '@renderer/lib/supabase'

// ── helpers ────────────────────────────────────────────────────────────────────

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5)  return 'Good night'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  if (h < 21) return 'Good evening'
  return 'Good night'
}

// ── sub-components ─────────────────────────────────────────────────────────────

function StatPill({
  label, value, color = 'text-slate-100',
}: { label: string; value: string; color?: string }): JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <p className={`text-xl font-bold tabular-nums font-mono ${color}`}>{value}</p>
      <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
    </div>
  )
}

interface TileConfig {
  icon: LucideIcon
  title: string
  description: string
  to: string
  accent: string
  locked?: boolean
}

function NavTile({ icon: Icon, title, description, to, accent, locked, navigate: nav }: TileConfig & { navigate: ReturnType<typeof useNavigate> }): JSX.Element {
  return (
    <button
      onClick={() => nav(locked ? '/paywall' : to)}
      className={`group relative backdrop-blur-sm rounded-2xl p-5 text-left transition-all duration-200 flex flex-col gap-3 ${
        locked
          ? 'bg-white/[0.01] border border-white/[0.03] opacity-40 cursor-pointer'
          : 'bg-white/[0.03] hover:bg-white/[0.055] border border-white/[0.06] hover:border-white/[0.12] hover:shadow-[0_8px_40px_rgba(0,0,0,0.45)] hover:-translate-y-0.5'
      }`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${locked ? 'bg-white/[0.04] text-slate-600' : accent}`}>
        <Icon size={18} className="shrink-0" />
      </div>
      <div>
        <p className={`font-semibold text-sm mb-0.5 ${locked ? 'text-slate-600' : 'text-slate-100 group-hover:text-white'} transition-colors`}>{title}</p>
        <p className="text-slate-500 text-xs leading-snug group-hover:text-slate-400 transition-colors">{description}</p>
      </div>
      {locked && (
        <div className="absolute top-3.5 right-3.5 w-5 h-5 rounded-full bg-white/[0.04] border border-white/[0.07] flex items-center justify-center">
          <svg width="9" height="9" viewBox="0 0 14 14" fill="none">
            <rect x="2" y="6" width="10" height="7" rx="1.5" stroke="#475569" strokeWidth="1.3"/>
            <path d="M4.5 6V4.5a2.5 2.5 0 0 1 5 0V6" stroke="#475569" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
        </div>
      )}
    </button>
  )
}

// ── plan badge ─────────────────────────────────────────────────────────────────

function PlanBadge({ status }: { status: string }): JSX.Element {
  const cfg = {
    active:   { label: 'Pro',      cls: 'bg-blue-500/15 text-blue-400 border-blue-500/25' },
    lifetime: { label: 'Lifetime', cls: 'bg-amber-400/15 text-amber-400 border-amber-400/25' },
    trial:    { label: 'Free',     cls: 'bg-white/[0.05] text-slate-500 border-white/[0.07]' },
    expired:  { label: 'Expired',  cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
  }[status] ?? { label: 'Free', cls: 'bg-white/[0.05] text-slate-500 border-white/[0.07]' }
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

// ── main page ──────────────────────────────────────────────────────────────────

export default function DashboardPage(): JSX.Element {
  const user               = useAuthStore((s) => s.user)
  const subscriptionStatus = useAuthStore((s) => s.subscriptionStatus)
  const avatarUrl          = useAuthStore((s) => s.avatarUrl)
  const trades             = useTradesStore((s) => s.trades)
  const fetchTrades        = useTradesStore((s) => s.fetchTrades)
  const isPro              = useIsPro()
  const navigate           = useNavigate()
  const isFree             = subscriptionStatus === 'trial' || subscriptionStatus === 'expired'

  const [displayName, setDisplayName] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.id) return
    fetchTrades(user.id)
    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()
      .then(({ data }) => { if (data?.display_name) setDisplayName(data.display_name) })
  }, [user?.id, fetchTrades])

  const stats = useMemo(() => {
    const closed   = trades.filter((t) => t.pnl !== null)
    const wins     = closed.filter((t) => (t.pnl ?? 0) > 0).length
    const winRate  = closed.length > 0 ? Math.round((wins / closed.length) * 100) : null
    const totalPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0)

    // Today
    const todayStr = new Date().toISOString().split('T')[0]
    const todayTrades = closed.filter(t => (t.opened_at ?? '').split('T')[0] === todayStr)
    const todayPnl    = todayTrades.reduce((s, t) => s + (t.pnl ?? 0), 0)

    // This week (Mon–Sun)
    const now = new Date()
    const dow = now.getDay()
    const monday = new Date(now)
    monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1))
    monday.setHours(0, 0, 0, 0)
    const weekTrades  = closed.filter(t => new Date(t.opened_at ?? t.created_at) >= monday)
    const weekPnl     = weekTrades.reduce((s, t) => s + (t.pnl ?? 0), 0)

    return { total: trades.length, winRate, totalPnl, closed: closed.length, todayPnl, todayCount: todayTrades.length, weekPnl, weekCount: weekTrades.length }
  }, [trades])

  const recentTrades = trades.slice(0, 5)
  const displayNameStr = displayName ?? user?.email?.split('@')[0] ?? 'Trader'

  const initials = (displayName?.[0] ?? user?.email?.[0] ?? '?').toUpperCase()

  const tiles: TileConfig[] = isPro ? [
    { icon: LineChart,  title: 'Charts',   description: 'Live charts with AI entry scoring',    to: '/charts',   accent: 'bg-blue-500/10 text-blue-400' },
    { icon: BookOpen,   title: 'Journal',  description: 'Review and reflect on all trades',     to: '/journal',  accent: 'bg-emerald-500/10 text-emerald-400' },
    { icon: Calendar,   title: 'Calendar', description: 'Upcoming macro events and data',       to: '/calendar', accent: 'bg-amber-500/10 text-amber-400' },
    { icon: FileText,   title: 'Reports',  description: 'AI-generated deep analysis',           to: '/reports',  accent: 'bg-purple-500/10 text-purple-400' },
    { icon: BarChart2,  title: 'Backtest', description: 'Test strategies on historical data',   to: '/backtest', accent: 'bg-orange-500/10 text-orange-400' },
    { icon: Settings,   title: 'Settings', description: 'Preferences and integrations',         to: '/settings', accent: 'bg-slate-500/10 text-slate-400' },
  ] : [
    { icon: LineChart,  title: 'Charts',   description: 'Live charts with AI entry scoring',    to: '/charts',   accent: 'bg-blue-500/10 text-blue-400' },
    { icon: Calendar,   title: 'Calendar', description: 'Upcoming macro events and data',       to: '/calendar', accent: 'bg-amber-500/10 text-amber-400' },
    { icon: Settings,   title: 'Settings', description: 'Preferences and integrations',         to: '/settings', accent: 'bg-slate-500/10 text-slate-400' },
    { icon: BookOpen,   title: 'Journal',  description: 'Review and reflect on all trades',     to: '/journal',  accent: 'bg-emerald-500/10 text-emerald-400', locked: true },
    { icon: FileText,   title: 'Reports',  description: 'AI-generated deep analysis',           to: '/reports',  accent: 'bg-purple-500/10 text-purple-400', locked: true },
    { icon: BarChart2,  title: 'Backtest', description: 'Test strategies on historical data',   to: '/backtest', accent: 'bg-orange-500/10 text-orange-400', locked: true },
  ]

  return (
    <Layout hideSidebar>
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="flex-1 flex flex-col">

          {/* Hero — profile + stats */}
          <div
            className="px-8 pt-10 pb-8 border-b border-white/[0.06] flex flex-col gap-6"
            style={{ background: 'linear-gradient(180deg, rgba(99,102,241,0.04) 0%, transparent 100%)' }}
          >
            {/* Brand */}
            <div className="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 22 22" fill="none" className="shrink-0">
                <rect width="22" height="22" rx="6" fill="rgba(99,102,241,0.14)"/>
                <path d="M4 11 C6 11 7 8 9 8 C11 8 12 14 14 14 C16 14 17 11 18 11"
                  stroke="#818cf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="text-slate-400 text-sm font-semibold tracking-tight">TradeTropics</span>
            </div>

            {/* Greeting */}
            <p className="text-slate-500 text-sm">
              {greeting()} —{' '}
              <span className="text-slate-400">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </span>
            </p>

            {/* Profile row */}
            <div className="flex items-center gap-5">
              {/* Avatar */}
              <button
                onClick={() => navigate('/account')}
                className="shrink-0 relative group"
                title="View account"
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="avatar"
                    className="w-20 h-20 rounded-2xl object-cover border-2 border-white/[0.08] group-hover:border-indigo-500/30 transition-colors"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-indigo-500/10 border-2 border-indigo-500/15 group-hover:border-indigo-500/30 flex items-center justify-center text-indigo-400 text-2xl font-bold transition-colors">
                    {initials}
                  </div>
                )}
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-surface-base/80 border border-white/[0.08] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="#94a3b8" strokeWidth="1.4" strokeLinecap="round">
                    <path d="M7 1v12M1 7h12" />
                  </svg>
                </div>
              </button>

              {/* Name + badge + stats */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap mb-4">
                  <h1 className="text-2xl font-bold text-slate-100 leading-none">
                    {displayNameStr ? `@${displayNameStr}` : displayNameStr}
                  </h1>
                  <PlanBadge status={subscriptionStatus} />
                </div>

                {/* Stat pills */}
                <div className="flex items-center gap-8 flex-wrap">
                  {stats.todayCount > 0 && (
                    <StatPill
                      label="Today"
                      value={`${stats.todayPnl >= 0 ? '+' : ''}$${Math.abs(stats.todayPnl).toFixed(0)}`}
                      color={stats.todayPnl > 0 ? 'text-emerald-400' : stats.todayPnl < 0 ? 'text-red-400' : 'text-slate-400'}
                    />
                  )}
                  {stats.weekCount > 0 && (
                    <StatPill
                      label="This Week"
                      value={`${stats.weekPnl >= 0 ? '+' : ''}$${Math.abs(stats.weekPnl).toFixed(0)}`}
                      color={stats.weekPnl > 0 ? 'text-emerald-400' : stats.weekPnl < 0 ? 'text-red-400' : 'text-slate-400'}
                    />
                  )}
                  <StatPill
                    label="Win Rate"
                    value={stats.winRate !== null ? `${stats.winRate}%` : '—'}
                    color={stats.winRate === null ? 'text-slate-500' : stats.winRate >= 50 ? 'text-emerald-400' : 'text-orange-400'}
                  />
                  <StatPill
                    label="Total P&L"
                    value={stats.closed > 0
                      ? `${stats.totalPnl >= 0 ? '+' : ''}$${Math.abs(stats.totalPnl).toFixed(0)}`
                      : '—'}
                    color={stats.closed === 0 ? 'text-slate-500' : stats.totalPnl > 0 ? 'text-emerald-400' : stats.totalPnl < 0 ? 'text-red-400' : 'text-slate-400'}
                  />
                  <StatPill
                    label="Total Trades"
                    value={String(stats.total)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Main content grid */}
          <div className="flex flex-1 gap-0">

            {/* Left: nav tiles */}
            <div className="flex-1 min-w-0 px-8 py-8 flex flex-col gap-8">

              <div>
                <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-4">Quick Access</p>
                <div className="grid grid-cols-3 gap-3">
                  {tiles.map((tile) => (
                    <NavTile key={tile.to} {...tile} navigate={navigate} />
                  ))}
                </div>
              </div>

              {/* Upgrade CTA for free users */}
              {isFree && (
                <div
                  className="border border-indigo-500/15 rounded-2xl p-6 flex items-center justify-between gap-6"
                  style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.07) 0%, rgba(59,130,246,0.04) 50%, transparent 100%)' }}
                >
                  <div className="flex-1">
                    <p className="text-slate-100 text-base font-semibold mb-2">Upgrade to Pro</p>
                    <p className="text-slate-400 text-sm leading-relaxed mb-3">
                      Unlock the AI Entry Score, unlimited reports, full trade journal, backtester, and Google Calendar integration.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {['AI Reports', 'Trade Journal', 'Backtest Engine', 'Calendar Sync'].map((f) => (
                        <span key={f} className="px-2 py-0.5 rounded-full text-[10px] border border-indigo-500/20 text-indigo-400/80">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => navigate('/paywall')}
                    className="shrink-0 px-5 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-sm font-bold text-white transition-colors shadow-[0_4px_16px_rgba(99,102,241,0.35)]"
                  >
                    Upgrade
                  </button>
                </div>
              )}
            </div>

            {/* Right: recent activity */}
            {recentTrades.length > 0 && (
              <div className="w-72 shrink-0 border-l border-white/[0.06] px-6 py-8 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-slate-600 uppercase tracking-widest">Recent Trades</p>
                  <button
                    onClick={() => navigate(isPro ? '/journal' : '/paywall')}
                    className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    All →
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  {recentTrades.map((t) => {
                    const isWin  = (t.pnl ?? 0) > 0
                    const isLoss = (t.pnl ?? 0) < 0
                    return (
                      <div
                        key={t.id}
                        className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-3 flex items-center gap-3"
                      >
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          t.direction === 'long' ? 'bg-emerald-500/10' : 'bg-red-500/10'
                        }`}>
                          {t.direction === 'long'
                            ? <TrendingUp size={13} className="text-emerald-400" />
                            : <TrendingDown size={13} className="text-red-400" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-200 text-xs font-semibold truncate">{t.symbol}</p>
                          <p className="text-slate-600 text-[10px]">
                            {new Date(t.opened_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </p>
                        </div>
                        {t.pnl !== null ? (
                          <span className={`text-xs font-mono font-semibold shrink-0 ${isWin ? 'text-emerald-400' : isLoss ? 'text-red-400' : 'text-slate-400'}`}>
                            {t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(2)}
                          </span>
                        ) : (
                          <div className="flex items-center gap-1 shrink-0">
                            <Minus size={9} className="text-slate-600" />
                            <span className="text-[10px] text-slate-600">Open</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
