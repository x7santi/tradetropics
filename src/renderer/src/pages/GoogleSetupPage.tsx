import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@renderer/store/authStore'
import { supabase } from '@renderer/lib/supabase'
import { isPasswordStrong } from '@renderer/lib/passwordStrength'
import PasswordStrengthBar from '@renderer/components/PasswordStrengthBar'

function baseFromEmail(email: string): string {
  const local = email.split('@')[0]
  const clean = local
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 20)
  return clean.length >= 3 ? clean : clean + 'usr'
}

async function isAvailable(username: string): Promise<boolean> {
  const { data } = await supabase.rpc('check_username_available', { p_username: username })
  return data === true
}

async function findAvailableUsername(email: string): Promise<string> {
  const base = baseFromEmail(email)
  if (await isAvailable(base)) return base
  for (let i = 0; i < 12; i++) {
    const n   = Math.floor(Math.random() * 9900) + 100
    const cand = base.slice(0, 16) + n
    if (await isAvailable(cand)) return cand
  }
  return base.slice(0, 16) + Date.now().toString().slice(-4)
}

type AvailState = 'idle' | 'checking' | 'available' | 'taken'

export default function GoogleSetupPage(): JSX.Element {
  const navigate             = useNavigate()
  const user                 = useAuthStore(s => s.user)
  const completeGoogleSetup  = useAuthStore(s => s.completeGoogleSetup)

  const [username,       setUsername]       = useState('')
  const [availState,     setAvailState]     = useState<AvailState>('idle')
  const [password,       setPassword]       = useState('')
  const [confirm,        setConfirm]        = useState('')
  const [error,          setError]          = useState<string | null>(null)
  const [loading,        setLoading]        = useState(false)
  const [generating,     setGenerating]     = useState(true)
  const skipCheckRef = useRef(false)

  // Auto-generate + verify username from email on mount
  useEffect(() => {
    const email = user?.email ?? ''
    if (!email) { setGenerating(false); return }
    findAvailableUsername(email).then(u => {
      skipCheckRef.current = true
      setUsername(u)
      setAvailState('available')
      setGenerating(false)
    })
  }, [user?.email])

  // Debounced availability check on manual edits
  useEffect(() => {
    if (!username) { setAvailState('idle'); return }
    if (skipCheckRef.current) { skipCheckRef.current = false; return }
    setAvailState('checking')
    const t = setTimeout(async () => {
      const ok = await isAvailable(username)
      setAvailState(ok ? 'available' : 'taken')
    }, 420)
    return () => clearTimeout(t)
  }, [username])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!isPasswordStrong(password)) {
      setError('Password must be at least 12 characters with uppercase, lowercase, number, and special character.')
      return
    }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (availState === 'taken') { setError('Username is taken — pick another.'); return }
    if (availState === 'checking') { setError('Still checking username…'); return }

    setLoading(true)
    const err = await completeGoogleSetup(username, password)
    setLoading(false)
    if (err) { setError(err); return }
    navigate('/dashboard', { replace: true })
  }

  const fieldCls   = 'w-full rounded-lg bg-surface-base border border-glass text-slate-100 px-4 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/[0.12] transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.35)]'
  const canSubmit  = !loading && !generating && availState === 'available' && isPasswordStrong(password) && password === confirm

  return (
    <div className="flex h-screen items-center justify-center bg-surface-base overflow-y-auto">
      <div className="w-full max-w-sm px-4 py-8">
        <div
          className="rounded-2xl border border-white/[0.09] px-6 py-8"
          style={{ background: 'linear-gradient(180deg, #0e1f35 0%, #0b1526 100%)', boxShadow: '0 1px 0 rgba(255,255,255,0.07) inset, 0 8px 40px rgba(0,0,0,0.65), 0 24px 64px rgba(0,0,0,0.4)' }}
        >
          {/* Header */}
          <div className="mb-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center mx-auto mb-4 shadow-[0_0_16px_rgba(99,102,241,0.12)]">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M3 11 C5 11 6 7.5 8.5 7.5 C11 7.5 12 14.5 14.5 14.5 C17 14.5 18 11 19 11"
                  stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-slate-100 mb-1">Complete your account</h1>
            <p className="text-slate-500 text-xs leading-relaxed max-w-[240px] mx-auto">
              Choose a username and set a password so you can sign in either way.
            </p>
          </div>

          <div className="border-t border-glass mb-5" />

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 mb-1.5 uppercase tracking-[0.1em]">Username</label>
              <div className="relative">
                {generating ? (
                  <div className="w-full rounded-lg bg-surface-base border border-glass px-4 py-2.5 text-slate-500 text-sm flex items-center gap-2 shadow-[inset_0_2px_4px_rgba(0,0,0,0.35)]">
                    <span className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin shrink-0" />
                    Generating…
                  </div>
                ) : (
                  <input
                    type="text"
                    value={username}
                    onChange={e => {
                      const v = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')
                      setUsername(v)
                    }}
                    required
                    maxLength={24}
                    placeholder="yourhandle"
                    autoComplete="off"
                    spellCheck={false}
                    className={`${fieldCls} pr-8 ${
                      availState === 'taken'     ? 'border-red-500/50'     :
                      availState === 'available' ? 'border-emerald-500/30' : ''
                    }`}
                  />
                )}
                {availState === 'checking' && <span className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />}
                {availState === 'available' && !generating && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 text-sm">✓</span>}
                {availState === 'taken'     && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400 text-sm">✕</span>}
              </div>
              {availState === 'taken' && (
                <p className="mt-1.5 text-xs text-red-400">Username taken — try another</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 mb-1.5 uppercase tracking-[0.1em]">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="Min. 12 characters"
                className={fieldCls}
              />
              <PasswordStrengthBar password={password} />
            </div>

            {/* Confirm */}
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 mb-1.5 uppercase tracking-[0.1em]">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                placeholder="••••••••"
                className={`${fieldCls} ${confirm && confirm !== password ? 'border-red-500/50' : ''}`}
              />
              {confirm && confirm !== password && (
                <p className="text-xs text-red-400 mt-1.5">Passwords don't match</p>
              )}
            </div>

            {error && (
              <p className="text-red-400 text-xs bg-red-400/[0.08] border border-red-400/20 rounded-lg px-4 py-2.5">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-2.5 text-sm transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_2px_8px_rgba(0,0,0,0.45)]"
            >
              {loading ? 'Setting up…' : 'Complete setup →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
