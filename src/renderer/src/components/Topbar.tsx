import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@renderer/store/authStore'
import { useSettingsStore } from '@renderer/store/settingsStore'

const PAGE_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/journal':   'Journal',
  '/calendar':  'Calendar',
  '/settings':  'Settings',
  '/account':   'Account',
  '/paywall':   'Upgrade',
  '/reports':   'Reports',
}

export default function Topbar(): JSX.Element {
  const navigate            = useNavigate()
  const location            = useLocation()
  const user                = useAuthStore((s) => s.user)
  const subscriptionStatus  = useAuthStore((s) => s.subscriptionStatus)
  const avatarUrl           = useAuthStore((s) => s.avatarUrl)
  const selectedTimezone    = useSettingsStore((s) => s.timezone)
  const [hovered, setHovered] = useState(false)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const pageTitle = PAGE_LABELS[location.pathname] ?? ''

  const autoTimezone   = Intl.DateTimeFormat().resolvedOptions().timeZone
  const displayTimezone = selectedTimezone || autoTimezone

  const timeString = now.toLocaleTimeString('en-US', {
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: displayTimezone,
  })
  const dateString = now.toLocaleDateString('en-US', {
    month: 'short',
    day:   'numeric',
    year:  'numeric',
    timeZone: displayTimezone,
  })

  const initials = (
    user?.user_metadata?.display_name?.[0] ??
    user?.email?.[0] ??
    '?'
  ).toUpperCase()

  const planConfig = {
    trial:    { label: 'Free',     cls: 'text-slate-400 border-slate-700/60',                 hoverLabel: 'Upgrade',     hoverCls: 'text-blue-400 border-blue-500/30 bg-blue-500/5' },
    active:   { label: 'Pro',      cls: 'text-blue-400 border-blue-500/30 bg-blue-500/5',     hoverLabel: 'Go Lifetime', hoverCls: 'text-amber-400 border-amber-400/30 bg-amber-400/5' },
    lifetime: { label: 'Lifetime', cls: 'text-amber-400 border-amber-400/30 bg-amber-400/5', hoverLabel: 'Lifetime',    hoverCls: 'text-amber-400 border-amber-400/30 bg-amber-400/5' },
    expired:  { label: 'Expired',  cls: 'text-rose-400 border-rose-500/30',                   hoverLabel: 'Renew',       hoverCls: 'text-blue-400 border-blue-500/30 bg-blue-500/5' },
  }[subscriptionStatus] ?? { label: 'Free', cls: 'text-slate-400 border-slate-700/60', hoverLabel: 'Upgrade', hoverCls: 'text-blue-400 border-blue-500/30 bg-blue-500/5' }

  const isClickable = subscriptionStatus !== 'lifetime'

  const handleBadgeClick = () => {
    if (subscriptionStatus === 'lifetime') return
    navigate('/paywall')
  }

  return (
    <header
      className="flex items-center h-12 border-b border-glass shrink-0 px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),inset_0_-1px_0_rgba(0,0,0,0.25)]"
      style={{ background: 'linear-gradient(180deg, #0e1f35 0%, #0b1526 100%)' }}
    >

      {/* Page title */}
      <p className="text-sm font-semibold text-slate-200 tracking-tight flex-1">{pageTitle}</p>

      {/* System time/date/timezone — clickable, goes to timezone setting */}
      <button
        onClick={() => navigate('/settings?highlight=timezone')}
        className="flex flex-col items-end text-[10px] text-slate-500 gap-0.5 mr-4 hover:text-slate-300 transition-colors"
      >
        <div className="flex items-center gap-1">
          <span className="font-mono tabular-nums text-slate-200">{timeString}</span>
          <span className="text-slate-700">·</span>
          <span className="text-slate-400">{dateString}</span>
        </div>
        <span className="text-slate-700">{displayTimezone}</span>
      </button>

      {/* Right controls */}
      <div className="flex items-center gap-2">

        {/* Subscription badge */}
        <button
          onClick={isClickable ? handleBadgeClick : undefined}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all duration-150 ${
            hovered && isClickable ? planConfig.hoverCls : planConfig.cls
          } ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
        >
          {hovered && isClickable ? planConfig.hoverLabel : planConfig.label}
        </button>

        {/* Avatar */}
        <button
          onClick={() => navigate('/account')}
          className="w-7 h-7 rounded-full bg-surface-2 border border-white/[0.13] overflow-hidden flex items-center justify-center text-slate-300 text-xs font-semibold hover:border-indigo-500/50 hover:text-indigo-300 transition-all duration-150 shadow-[0_1px_3px_rgba(0,0,0,0.4)]"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
          ) : initials}
        </button>

      </div>
    </header>
  )
}
