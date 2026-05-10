import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@renderer/store/authStore'
import { supabase } from '@renderer/lib/supabase'
import { blockSpaceKeyDown, stripWhitespace } from '@renderer/lib/noSpacesInput'
import { isPasswordStrong } from '@renderer/lib/passwordStrength'
import PasswordStrengthBar from '@renderer/components/PasswordStrengthBar'

type AvailState = 'idle' | 'checking' | 'available' | 'taken' | 'error'

function UsernameStatus({ state }: { state: AvailState }): JSX.Element | null {
  if (state === 'idle')      return <span className="text-xs text-slate-400">Letters, numbers and underscores only</span>
  if (state === 'checking')  return <span className="text-xs text-slate-400 animate-pulse">Checking availability…</span>
  if (state === 'available') return <span className="text-xs text-emerald-400 font-medium">✓ Username available</span>
  if (state === 'taken')     return <span className="text-xs text-red-400 font-medium">✕ Username already taken</span>
  if (state === 'error')     return <span className="text-xs text-slate-400">Could not verify — will check on submit</span>
  return null
}

export default function SignupPage(): JSX.Element {
  const [email,      setEmail]      = useState('')
  const [username,   setUsername]   = useState('')
  const [password,   setPassword]   = useState('')
  const [confirm,    setConfirm]    = useState('')
  const [error,      setError]      = useState<string | null>(null)
  const [success,    setSuccess]    = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [availState, setAvailState] = useState<AvailState>('idle')

  const signUp   = useAuthStore((s) => s.signUp)
  const navigate = useNavigate()
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isValidFormat = (u: string) => u.length >= 3 && /^[a-zA-Z0-9_]+$/.test(u)

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    if (!username)              { setAvailState('idle'); return }
    if (!isValidFormat(username)) { setAvailState('idle'); return }

    setAvailState('checking')
    debounce.current = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc('check_username_available', { p_username: username })
        if (error) { setAvailState('error'); return }
        setAvailState(data === true ? 'available' : 'taken')
      } catch {
        setAvailState('error')
      }
    }, 500)

    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [username])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!isValidFormat(username)) { setError('Username must be at least 3 characters — letters, numbers and underscores only.'); return }
    if (availState === 'taken')   { setError('That username is already taken. Pick another one.'); return }
    if (!isPasswordStrong(password)) { setError('Password must be at least 12 characters with uppercase, lowercase, number, and special character.'); return }
    if (password !== confirm)     { setError('Passwords do not match.'); return }

    setLoading(true)
    const err = await signUp(email, password, username)
    setLoading(false)
    if (err) setError(err)
    else { setSuccess(true); setTimeout(() => navigate('/'), 3000) }
  }

  const fieldCls = 'w-full rounded-lg bg-surface-base border border-glass text-slate-100 px-4 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/[0.12] transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.35)]'

  if (success) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-base">
        <div className="w-full max-w-sm px-4">
          <div
            className="rounded-2xl border border-white/[0.09] px-6 py-10 text-center"
            style={{ background: 'linear-gradient(180deg, #0e1f35 0%, #0b1526 100%)', boxShadow: '0 1px 0 rgba(255,255,255,0.07) inset, 0 8px 40px rgba(0,0,0,0.65), 0 24px 64px rgba(0,0,0,0.4)' }}
          >
            <div className="w-14 h-14 rounded-full bg-blue-500/10 border border-blue-500/25 flex items-center justify-center mx-auto mb-4 shadow-[0_0_20px_rgba(59,130,246,0.15)]">
              <span className="text-blue-400 text-xl">✓</span>
            </div>
            <h2 className="text-lg font-semibold text-slate-100 mb-2">Check your email</h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              We sent a confirmation link to <span className="text-slate-200">{email}</span>.
              <br />Click it to activate your account, then sign in.
            </p>
            <p className="text-slate-700 text-xs mt-5 font-mono">Redirecting to login…</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen items-center justify-center bg-surface-base overflow-y-auto">
      <div className="w-full max-w-sm px-4 py-8">
        <div
          className="rounded-2xl border border-white/[0.09] px-6 py-8"
          style={{ background: 'linear-gradient(180deg, #0e1f35 0%, #0b1526 100%)', boxShadow: '0 1px 0 rgba(255,255,255,0.07) inset, 0 8px 40px rgba(0,0,0,0.65), 0 24px 64px rgba(0,0,0,0.4)' }}
        >

        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center shadow-[0_0_16px_rgba(99,102,241,0.12)]">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M3 11 C5 11 6 7.5 8.5 7.5 C11 7.5 12 14.5 14.5 14.5 C17 14.5 18 11 19 11"
                  stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="text-slate-100 font-bold text-xl tracking-tight">TradeTropics</span>
          </div>
          <p className="text-slate-300 text-sm font-medium mb-1">Start trading smarter</p>
          <p className="text-slate-500 text-xs">AI entry scoring, trend bias &amp; economic events</p>
        </div>

        <div className="border-t border-glass mb-6" />

        <form onSubmit={handleSubmit} className="space-y-3">

          {/* Username */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 mb-1.5 uppercase tracking-[0.1em]">Username</label>
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.trim())}
                required
                placeholder="yourhandle"
                autoComplete="off"
                spellCheck={false}
                className={`${fieldCls} pr-8 ${
                  availState === 'available' ? 'border-emerald-500/50 focus:border-emerald-500/70' :
                  availState === 'taken'     ? 'border-red-500/50 focus:border-red-500/70' : ''
                }`}
              />
              {availState === 'checking' && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
              )}
              {availState === 'available' && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 text-sm">✓</span>
              )}
              {availState === 'taken' && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400 text-sm">✕</span>
              )}
            </div>
            <div className="mt-1.5 ml-0.5">
              <UsernameStatus state={availState} />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 mb-1.5 uppercase tracking-[0.1em]">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(stripWhitespace(e.target.value))}
              onKeyDown={blockSpaceKeyDown}
              required
              placeholder="you@example.com"
              className={fieldCls}
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 mb-1.5 uppercase tracking-[0.1em]">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(stripWhitespace(e.target.value))}
              onKeyDown={blockSpaceKeyDown}
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
              onChange={(e) => setConfirm(stripWhitespace(e.target.value))}
              onKeyDown={blockSpaceKeyDown}
              required
              placeholder="••••••••"
              className={`${fieldCls} ${confirm && confirm !== password ? 'border-red-500/50' : ''}`}
            />
            {confirm && confirm !== password && (
              <p className="text-xs text-red-400 mt-1.5 ml-0.5">Passwords don't match</p>
            )}
          </div>

          {error && (
            <p className="text-red-400 text-xs bg-red-400/8 border border-red-400/15 rounded-lg px-4 py-2.5">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || availState === 'taken' || availState === 'checking'}
            className="w-full bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-2.5 text-sm transition-all mt-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_2px_8px_rgba(0,0,0,0.45)]"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-slate-500">
          Already have an account?{' '}
          <Link to="/" className="text-blue-400 hover:text-blue-300 transition-colors">
            Sign in
          </Link>
        </div>
        </div>
      </div>
    </div>
  )
}
