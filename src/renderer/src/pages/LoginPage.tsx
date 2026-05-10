import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@renderer/store/authStore'
import { blockSpaceKeyDown, stripWhitespace } from '@renderer/lib/noSpacesInput'
import { playTypewriterKey } from '@renderer/lib/sounds'

function GoogleIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  )
}

export default function LoginPage(): JSX.Element {
  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [error,       setError]       = useState<string | null>(null)
  const [loading,     setLoading]     = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const signIn           = useAuthStore((s) => s.signIn)
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle)
  const needsProfileSetup = useAuthStore((s) => s.needsProfileSetup)
  const navigate         = useNavigate()

  const handleGoogleSignIn = async () => {
    setError(null)
    setGoogleLoading(true)
    const err = await signInWithGoogle()
    setGoogleLoading(false)
    if (err) { setError(err); return }
    if (needsProfileSetup) navigate('/google-setup')
    else navigate('/dashboard')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    playTypewriterKey()
    const err = await signIn(email, password)
    setLoading(false)
    if (err) setError(err)
    else navigate('/dashboard')
  }

  const fieldCls = 'w-full rounded-lg bg-surface-base border border-glass text-slate-100 px-4 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/[0.12] transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.35)]'

  return (
    <div className="flex h-screen items-center justify-center bg-surface-base overflow-y-auto">
      <div className="w-full max-w-sm px-4 py-8">
        <div
          className="rounded-2xl border border-white/[0.09] px-6 py-8"
          style={{
            background: 'linear-gradient(180deg, #0e1f35 0%, #0b1526 100%)',
            boxShadow: '0 1px 0 rgba(255,255,255,0.07) inset, 0 8px 40px rgba(0,0,0,0.65), 0 24px 64px rgba(0,0,0,0.4)',
          }}
        >
          {/* Brand */}
          <div className="mb-7 text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center shadow-[0_0_16px_rgba(99,102,241,0.12)]">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <path d="M3 11 C5 11 6 7.5 8.5 7.5 C11 7.5 12 14.5 14.5 14.5 C17 14.5 18 11 19 11"
                    stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span className="text-slate-100 font-bold text-xl tracking-tight">TradeTropics</span>
            </div>
            <p className="text-slate-300 text-sm font-medium mb-1">AI-powered trade intelligence</p>
            <p className="text-slate-500 text-xs leading-relaxed max-w-[260px] mx-auto">
              Real-time entry scoring, trend bias &amp; economic alerts
            </p>
          </div>

          {/* Google sign-in */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            className="w-full flex items-center justify-center gap-2.5 bg-white/[0.06] hover:bg-white/[0.10] disabled:opacity-50 disabled:cursor-not-allowed border border-white/[0.12] rounded-lg py-2.5 text-sm font-medium text-slate-200 transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          >
            {googleLoading
              ? <span className="w-4 h-4 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
              : <GoogleIcon />
            }
            {googleLoading ? 'Opening Google…' : 'Continue with Google'}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 border-t border-glass" />
            <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">or</span>
            <div className="flex-1 border-t border-glass" />
          </div>

          {/* Email / password form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 mb-1.5 uppercase tracking-[0.1em]">
                Email or username
              </label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(stripWhitespace(e.target.value))}
                onKeyDown={blockSpaceKeyDown}
                required
                placeholder="you@example.com or username"
                className={fieldCls}
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-500 mb-1.5 uppercase tracking-[0.1em]">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(stripWhitespace(e.target.value))}
                onKeyDown={blockSpaceKeyDown}
                required
                placeholder="••••••••"
                className={fieldCls}
              />
            </div>

            {error && (
              <p className="text-red-400 text-xs bg-red-400/[0.08] border border-red-400/20 rounded-lg px-4 py-2.5">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-2.5 text-sm transition-all mt-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_2px_8px_rgba(0,0,0,0.45)]"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {/* Footer links */}
          <div className="mt-6 flex justify-between text-xs text-slate-500">
            <Link to="/signup" className="hover:text-blue-400 transition-colors">
              Create account
            </Link>
            <Link to="/forgot-password" className="hover:text-blue-400 transition-colors">
              Forgot password?
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
