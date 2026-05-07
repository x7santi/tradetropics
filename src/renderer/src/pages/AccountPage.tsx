import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '@renderer/components/Layout'
import { useAuthStore } from '@renderer/store/authStore'
import { useTradesStore } from '@renderer/store/tradesStore'
import { supabase } from '@renderer/lib/supabase'

interface ProfileData {
  display_name: string | null
  created_at:   string | null
}

function InfoRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between py-3 border-t border-glass">
      <p className="text-xs text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-slate-300">{value}</p>
    </div>
  )
}

function StatCard({
  label, value, color = 'text-slate-100',
}: { label: string; value: string; color?: string }): JSX.Element {
  return (
    <div className="bg-surface-2/60 rounded-xl p-4 text-center border border-glass">
      <p className={`text-2xl font-bold ${color} mb-1 tabular-nums`}>{value}</p>
      <p className="text-xs text-slate-400 uppercase tracking-wider">{label}</p>
    </div>
  )
}

export default function AccountPage(): JSX.Element {
  const user               = useAuthStore((s) => s.user)
  const subscriptionStatus = useAuthStore((s) => s.subscriptionStatus)
  const avatarUrl          = useAuthStore((s) => s.avatarUrl)
  const setAvatarUrl       = useAuthStore((s) => s.setAvatarUrl)
  const signOut            = useAuthStore((s) => s.signOut)
  const navigate           = useNavigate()

  const trades      = useTradesStore((s) => s.trades)
  const fetchTrades = useTradesStore((s) => s.fetchTrades)

  const [profile,     setProfile]     = useState<ProfileData | null>(null)
  const [copied,      setCopied]      = useState(false)
  const [uploading,   setUploading]   = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!user?.id) return
    supabase
      .from('profiles')
      .select('display_name, created_at')
      .eq('id', user.id)
      .single()
      .then(({ data }) => { if (data) setProfile(data as ProfileData) })
    fetchTrades(user.id)
  }, [user?.id, fetchTrades])

  const closed   = trades.filter((t) => t.pnl !== null)
  const wins     = closed.filter((t) => (t.pnl ?? 0) > 0).length
  const winRate  = closed.length > 0 ? Math.round((wins / closed.length) * 100) : null
  const totalPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0)

  const memberSince = (() => {
    const raw = profile?.created_at ?? user?.created_at
    if (!raw) return '—'
    return new Date(raw).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
  })()

  const planConfig = {
    trial:    { label: 'Free',     cls: 'bg-surface-3 text-slate-400 border-glass' },
    active:   { label: 'Pro',      cls: 'bg-blue-500/15 text-blue-400 border-blue-500/25' },
    lifetime: { label: 'Lifetime', cls: 'bg-amber-400/15 text-amber-400 border-amber-400/25' },
    expired:  { label: 'Expired',  cls: 'bg-red-500/15 text-red-400 border-red-500/25' },
  }[subscriptionStatus] ?? { label: 'Free', cls: 'bg-surface-3 text-slate-400 border-glass' }

  const initials = (
    profile?.display_name?.[0] ?? user?.email?.[0] ?? '?'
  ).toUpperCase()

  const copyId = () => {
    if (!user?.id) return
    navigator.clipboard.writeText(user.id).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user?.id) return
    setUploading(true)
    setUploadError(null)
    try {
      const ext  = file.name.split('.').pop() ?? 'jpg'
      const path = `${user.id}/avatar.${ext}`
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      const cacheBusted = `${publicUrl}?t=${Date.now()}`

      await supabase.from('profiles').update({ avatar_url: cacheBusted }).eq('id', user.id)
      setAvatarUrl(cacheBusted)
    } catch (err: any) {
      setUploadError(err?.message ?? 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/', { replace: true })
  }

  const isFree  = subscriptionStatus === 'trial' || subscriptionStatus === 'expired'
  const isPro   = subscriptionStatus === 'active'

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-6 py-8 flex flex-col gap-4 overflow-y-auto">

        {/* Profile card */}
        <div className="bg-surface-1 border border-glass rounded-2xl p-6">

          {/* Avatar + name */}
          <div className="flex items-center gap-4 mb-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="relative w-14 h-14 rounded-full shrink-0 group focus:outline-none"
              title="Change profile picture"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="avatar"
                  className="w-14 h-14 rounded-full object-cover border-2 border-blue-500/20"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-blue-500/10 border-2 border-blue-500/20 flex items-center justify-center text-blue-400 text-xl font-bold">
                  {uploading ? (
                    <svg className="animate-spin w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40 60" />
                    </svg>
                  ) : initials}
                </div>
              )}
              {/* camera overlay on hover */}
              {!uploading && (
                <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                </div>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
            <div className="flex-1 min-w-0">
              <p className="text-slate-100 font-semibold text-base leading-tight truncate">
                {profile?.display_name ? `@${profile.display_name}` : user?.email ?? '—'}
              </p>
              {profile?.display_name && (
                <p className="text-slate-400 text-sm truncate">{user?.email}</p>
              )}
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border shrink-0 ${planConfig.cls}`}>
              {planConfig.label}
            </span>
          </div>

          {uploadError && (
            <p className="text-xs text-red-400 mt-2">{uploadError}</p>
          )}

          {/* Info rows */}
          <div className="mt-2">
            {profile?.display_name && (
              <InfoRow label="Username"     value={`@${profile.display_name}`} />
            )}
            <InfoRow label="Email"        value={user?.email ?? '—'} />
            <InfoRow label="Member since" value={memberSince} />
            <InfoRow label="Plan"         value={planConfig.label} />

            {/* User ID */}
            <div className="flex items-start justify-between py-3 border-t border-glass gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">User ID</p>
                <p className="text-xs font-mono text-slate-400 break-all leading-relaxed">
                  {user?.id ?? '—'}
                </p>
                <p className="text-xs text-slate-600 mt-0.5">Quote this when contacting support</p>
              </div>
              <button
                onClick={copyId}
                disabled={!user?.id}
                className="shrink-0 px-3 py-1.5 rounded-lg border border-glass hover:border-blue-500/30 text-xs text-slate-400 hover:text-blue-400 transition-colors disabled:opacity-30 mt-0.5"
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>

        {/* Trading stats */}
        <div className="bg-surface-1 border border-glass rounded-2xl p-6">
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-4">Trading Stats</p>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Trades" value={String(trades.length)} />
            <StatCard
              label="Win Rate"
              value={winRate !== null ? `${winRate}%` : '—'}
              color={winRate !== null ? (winRate >= 50 ? 'text-emerald-400' : 'text-orange-400') : 'text-slate-400'}
            />
            <StatCard
              label="Total P&L"
              value={closed.length > 0 ? `${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}` : '—'}
              color={
                closed.length === 0 ? 'text-slate-400' :
                totalPnl > 0 ? 'text-emerald-400' :
                totalPnl < 0 ? 'text-red-400' : 'text-slate-400'
              }
            />
          </div>
          {trades.length === 0 && (
            <p className="text-slate-600 text-xs text-center mt-4">
              No trades logged yet — head to the dashboard to start tracking
            </p>
          )}
        </div>

        {/* Free → upgrade to Pro */}
        {isFree && (
          <div
            className="border border-blue-500/15 rounded-2xl p-5 flex items-center justify-between gap-4"
            style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.07) 0%, transparent 60%)' }}
          >
            <div>
              <p className="text-slate-100 text-sm font-semibold mb-1">Upgrade to Pro</p>
              <p className="text-slate-400 text-xs leading-snug">
                Unlock the Entry Score, full market analysis, and trade journal
              </p>
            </div>
            <button
              onClick={() => navigate('/paywall')}
              className="shrink-0 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-400 text-sm font-bold text-white transition-colors"
            >
              Upgrade
            </button>
          </div>
        )}

        {/* Pro → soft lifetime upsell */}
        {isPro && (
          <div
            className="border border-amber-400/15 rounded-2xl p-5 flex items-center justify-between gap-4"
            style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.05) 0%, transparent 60%)' }}
          >
            <div>
              <p className="text-slate-200 text-sm font-semibold mb-1">Go Lifetime</p>
              <p className="text-slate-400 text-xs leading-snug">
                One payment, no renewals. From $40 with your Pro credit.
              </p>
            </div>
            <button
              onClick={() => navigate('/paywall')}
              className="shrink-0 px-4 py-2 rounded-lg border border-amber-400/25 bg-amber-400/10 hover:bg-amber-400/20 text-sm font-semibold text-amber-400 transition-colors"
            >
              See offer
            </button>
          </div>
        )}

        {/* Account actions */}
        <div className="bg-surface-1 border border-glass rounded-2xl p-6">
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-4">Account Actions</p>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/8 text-sm font-medium transition-colors"
          >
            Sign out
          </button>
        </div>

      </div>
    </Layout>
  )
}
