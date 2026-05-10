import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '@renderer/components/Layout'
import { useAuthStore } from '@renderer/store/authStore'
import { useTradesStore } from '@renderer/store/tradesStore'
import { supabase } from '@renderer/lib/supabase'
import type { Trade, FakeTradeRow } from '@renderer/store/tradesStore'

interface ProfileData {
  display_name: string | null
  created_at:   string | null
}

// ── helpers ────────────────────────────────────────────────────────────────────

function exportTradesToCSV(trades: Trade[]): void {
  const headers = ['Symbol', 'Direction', 'Entry', 'Exit', 'P&L', 'Size', 'Notes', 'Date']
  const rows = trades.map(t => [
    t.symbol,
    t.direction,
    t.entry.toFixed(5),
    t.exit_price?.toFixed(5) ?? '',
    t.pnl?.toFixed(2) ?? '',
    String(t.size),
    (t.notes ?? '').replace(/"/g, '""'),
    new Date(t.opened_at).toLocaleDateString('en-US'),
  ])
  const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `tradetropics-trades-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

async function parseImportCSV(file: File): Promise<{ rows: FakeTradeRow[]; errors: string[] }> {
  const text   = await file.text()
  const lines  = text.split('\n').map(l => l.trim()).filter(Boolean)
  const rows: FakeTradeRow[] = []
  const errors: string[] = []

  const header = lines[0]?.toLowerCase() ?? ''
  const hasHeader = header.includes('symbol') || header.includes('direction') || header.includes('entry')
  const dataLines = hasHeader ? lines.slice(1) : lines

  dataLines.forEach((line, i) => {
    const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim())
    const [symbol, direction, entryStr, exitStr, pnlStr, sizeStr, notes, dateStr] = cols
    if (!symbol || !direction || !entryStr) { errors.push(`Row ${i + 2}: missing required fields`); return }
    const entry = parseFloat(entryStr)
    const exit  = exitStr  ? parseFloat(exitStr)  : undefined
    const pnl   = pnlStr   ? parseFloat(pnlStr)   : undefined
    const size  = sizeStr  ? parseFloat(sizeStr)  : 1
    if (isNaN(entry)) { errors.push(`Row ${i + 2}: invalid entry price`); return }
    const dir = direction.toLowerCase()
    if (dir !== 'long' && dir !== 'short' && dir !== 'buy' && dir !== 'sell') {
      errors.push(`Row ${i + 2}: direction must be long/short`); return
    }
    const normalizedDir: 'long' | 'short' = (dir === 'buy' || dir === 'long') ? 'long' : 'short'
    const opened_at = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString()

    rows.push({
      symbol: symbol.toUpperCase(),
      direction: normalizedDir,
      entry,
      exit_price: exit && !isNaN(exit) ? exit : entry,
      size: isNaN(size) ? 1 : size,
      pnl: pnl && !isNaN(pnl) ? pnl : 0,
      notes: notes ?? '',
      opened_at,
    })
  })

  return { rows, errors }
}

// ── sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({ title, description }: { title: string; description?: string }): JSX.Element {
  return (
    <div className="mb-5">
      <h2 className="text-slate-100 text-sm font-semibold">{title}</h2>
      {description && <p className="text-slate-500 text-xs mt-1 leading-relaxed">{description}</p>}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between py-3 border-t border-white/[0.06]">
      <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-slate-300">{value}</p>
    </div>
  )
}

function StatCard({ label, value, color = 'text-slate-100' }: { label: string; value: string; color?: string }): JSX.Element {
  return (
    <div className="bg-white/[0.04] backdrop-blur-sm rounded-xl p-4 text-center border border-white/[0.07]">
      <p className={`text-xl font-bold ${color} mb-1 tabular-nums font-mono`}>{value}</p>
      <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
    </div>
  )
}

// ── main page ──────────────────────────────────────────────────────────────────

export default function AccountPage(): JSX.Element {
  const user               = useAuthStore((s) => s.user)
  const subscriptionStatus = useAuthStore((s) => s.subscriptionStatus)
  const avatarUrl          = useAuthStore((s) => s.avatarUrl)
  const setAvatarUrl       = useAuthStore((s) => s.setAvatarUrl)
  const signOut            = useAuthStore((s) => s.signOut)
  const navigate           = useNavigate()

  const trades           = useTradesStore((s) => s.trades)
  const fetchTrades      = useTradesStore((s) => s.fetchTrades)
  const insertFakeTrades = useTradesStore((s) => s.insertFakeTrades)

  const [profile,       setProfile]       = useState<ProfileData | null>(null)
  const [copied,        setCopied]        = useState(false)
  const [uploading,     setUploading]     = useState(false)
  const [uploadError,   setUploadError]   = useState<string | null>(null)
  const [emailVisible,  setEmailVisible]  = useState(false)
  const [importStatus,  setImportStatus]  = useState<string | null>(null)
  const [exportDone,    setExportDone]    = useState(false)
  const fileInputRef   = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

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
    trial:    { label: 'Free',     cls: 'bg-white/[0.05] text-slate-400 border-white/[0.07]' },
    active:   { label: 'Pro',      cls: 'bg-blue-500/15 text-blue-400 border-blue-500/25' },
    lifetime: { label: 'Lifetime', cls: 'bg-amber-400/15 text-amber-400 border-amber-400/25' },
    expired:  { label: 'Expired',  cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
  }[subscriptionStatus] ?? { label: 'Free', cls: 'bg-white/[0.05] text-slate-400 border-white/[0.07]' }

  const initials = (profile?.display_name?.[0] ?? user?.email?.[0] ?? '?').toUpperCase()

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
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })
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

  const handleExportCSV = () => {
    exportTradesToCSV(trades)
    setExportDone(true)
    setTimeout(() => setExportDone(false), 3000)
  }

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user?.id) return
    setImportStatus('Parsing…')
    try {
      const { rows, errors } = await parseImportCSV(file)
      if (rows.length === 0) {
        setImportStatus(`No valid rows found.${errors.length > 0 ? ` Errors: ${errors.slice(0, 3).join('; ')}` : ''}`)
      } else {
        const result = await insertFakeTrades(user.id, rows)
        if (result.ok) {
          setImportStatus(`✓ Imported ${result.count} trade${result.count !== 1 ? 's' : ''}${errors.length > 0 ? ` (${errors.length} skipped)` : ''}`)
        } else {
          setImportStatus(`Import failed: ${result.error}`)
        }
      }
    } catch (err: any) {
      setImportStatus(`Error: ${err?.message ?? 'Unknown error'}`)
    } finally {
      e.target.value = ''
      setTimeout(() => setImportStatus(null), 5000)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/', { replace: true })
  }

  const isFree = subscriptionStatus === 'trial' || subscriptionStatus === 'expired'

  return (
    <Layout>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-5">

          {/* ── Profile ──────────────────────────────────────────────────────── */}
          <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.07] rounded-2xl p-6">

            {/* Avatar + name row */}
            <div className="flex items-start gap-5 mb-4">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="relative w-16 h-16 rounded-2xl shrink-0 group focus:outline-none"
                title="Change profile picture"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="avatar" className="w-16 h-16 rounded-2xl object-cover border-2 border-white/[0.07] group-hover:border-indigo-500/30 transition-colors" />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border-2 border-indigo-500/15 group-hover:border-indigo-500/30 flex items-center justify-center text-indigo-400 text-xl font-bold transition-colors">
                    {uploading
                      ? <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40 60" /></svg>
                      : initials
                    }
                  </div>
                )}
                {!uploading && (
                  <div className="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                      <circle cx="12" cy="13" r="4"/>
                    </svg>
                  </div>
                )}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="text-slate-100 font-semibold text-base leading-tight truncate">
                    {profile?.display_name ? `@${profile.display_name}` : user?.email ?? '—'}
                  </p>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${planConfig.cls}`}>
                    {planConfig.label}
                  </span>
                </div>
                <p className="text-slate-600 text-xs mt-1">Member since {memberSince}</p>
              </div>
            </div>

            {uploadError && <p className="text-xs text-red-400 mb-3">{uploadError}</p>}

            {/* Info rows */}
            {profile?.display_name && <InfoRow label="Username" value={`@${profile.display_name}`} />}

            {/* Email with privacy toggle */}
            <div className="flex items-center justify-between py-3 border-t border-white/[0.06]">
              <p className="text-xs text-slate-500 uppercase tracking-wider">Email</p>
              <button
                onClick={() => setEmailVisible(v => !v)}
                className="flex items-center gap-2 group"
                title={emailVisible ? 'Hide email' : 'Reveal email'}
              >
                <span className={`text-sm transition-all ${emailVisible ? 'text-slate-300' : 'text-slate-600 blur-[3px] select-none'}`}>
                  {user?.email ?? '—'}
                </span>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="text-slate-600 group-hover:text-slate-400 transition-colors shrink-0">
                  {emailVisible
                    ? <><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.3"/><circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3"/><line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></>
                    : <><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.3"/><circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3"/></>
                  }
                </svg>
              </button>
            </div>

            <InfoRow label="Plan" value={planConfig.label} />

            {/* User ID */}
            <div className="flex items-start justify-between py-3 border-t border-white/[0.06] gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">User ID</p>
                <p className="text-xs font-mono text-slate-500 break-all leading-relaxed">{user?.id ?? '—'}</p>
                <p className="text-xs text-slate-700 mt-0.5">Quote this when contacting support</p>
              </div>
              <button
                onClick={copyId}
                disabled={!user?.id}
                className="shrink-0 px-3 py-1.5 rounded-lg border border-white/[0.07] hover:border-blue-500/30 text-xs text-slate-400 hover:text-blue-400 transition-colors disabled:opacity-30 mt-0.5"
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* ── Trading Stats ─────────────────────────────────────────────────── */}
          <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.07] rounded-2xl p-6">
            <SectionHeader title="Trading Stats" />
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Total Trades" value={String(trades.length)} />
              <StatCard
                label="Win Rate"
                value={winRate !== null ? `${winRate}%` : '—'}
                color={winRate !== null ? (winRate >= 50 ? 'text-emerald-400' : 'text-orange-400') : 'text-slate-400'}
              />
              <StatCard
                label="Total P&L"
                value={closed.length > 0 ? `${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}` : '—'}
                color={closed.length === 0 ? 'text-slate-400' : totalPnl > 0 ? 'text-emerald-400' : totalPnl < 0 ? 'text-red-400' : 'text-slate-400'}
              />
            </div>
          </div>

          {/* ── Upgrade CTA ───────────────────────────────────────────────────── */}
          {isFree && (
            <div
              className="border border-blue-500/15 rounded-2xl p-5 flex items-center justify-between gap-4"
              style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.07) 0%, transparent 60%)' }}
            >
              <div>
                <p className="text-slate-100 text-sm font-semibold mb-1">Upgrade to Pro</p>
                <p className="text-slate-400 text-xs leading-snug">Unlock AI Entry Score, reports, journal, and backtest engine</p>
              </div>
              <button
                onClick={() => navigate('/paywall')}
                className="shrink-0 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-400 text-sm font-bold text-white transition-colors"
              >
                Upgrade
              </button>
            </div>
          )}

          {/* ── Data & Export ─────────────────────────────────────────────────── */}
          <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.07] rounded-2xl p-6">
            <SectionHeader
              title="Data & Export"
              description="Export your trade history or import trades from TradeTropics or MT4 CSV format."
            />

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleExportCSV}
                disabled={trades.length === 0}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-150 disabled:opacity-30 text-left ${
                  exportDone
                    ? 'border-emerald-500/30 bg-emerald-500/10'
                    : 'border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.12]'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#34d399" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 2v8M5 7l3 3 3-3"/>
                    <path d="M2 12h12"/>
                  </svg>
                </div>
                <div>
                  <p className={`text-xs font-semibold ${exportDone ? 'text-emerald-400' : 'text-slate-200'}`}>
                    {exportDone ? '✓ Downloaded' : 'Export CSV'}
                  </p>
                  <p className="text-slate-500 text-[10px]">{trades.length} trades</p>
                </div>
              </button>

              <button
                onClick={() => importInputRef.current?.click()}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.12] transition-all duration-150 text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#60a5fa" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 10V2M5 5l3-3 3 3"/>
                    <path d="M2 12h12"/>
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-200">Import CSV</p>
                  <p className="text-slate-500 text-[10px]">TradeTropics or MT4 format</p>
                </div>
              </button>

              <input
                ref={importInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleImportCSV}
              />
            </div>

            {importStatus && (
              <p className={`mt-3 text-xs font-mono ${importStatus.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>
                {importStatus}
              </p>
            )}

            <p className="text-slate-700 text-[10px] mt-3 leading-relaxed">
              Accepts: Symbol, Direction, Entry, Exit, P&L, Size, Notes, Date (CSV header optional)
            </p>
          </div>

          {/* ── Account Actions ───────────────────────────────────────────────── */}
          <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.07] rounded-2xl p-6">
            <SectionHeader title="Account Actions" />
            <button
              onClick={handleSignOut}
              className="px-4 py-2 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/8 text-sm font-medium transition-colors"
            >
              Sign out
            </button>
          </div>

        </div>
      </div>
    </Layout>
  )
}
