import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@renderer/store/authStore'
import { blockSpaceKeyDown, stripWhitespace } from '@renderer/lib/noSpacesInput'

export default function ForgotPasswordPage(): JSX.Element {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const resetPassword = useAuthStore((s) => s.resetPassword)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const err = await resetPassword(email)
    setLoading(false)
    if (err) setError(err)
    else setSent(true)
  }

  const fieldCls = 'w-full rounded-lg bg-surface-2 border border-glass text-slate-100 px-4 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:border-blue-500/50 transition-colors'

  if (sent) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-base">
        <div className="w-full max-w-sm text-center px-6">
          <div className="w-14 h-14 rounded-full bg-blue-500/10 border border-blue-500/25 flex items-center justify-center mx-auto mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 8l7.89 5.26a2 2 0 0 0 2.22 0L21 8M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z"/>
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">Check your email</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            If <span className="text-slate-300">{email}</span> is registered, you'll receive a
            password reset link shortly.
          </p>
          <Link
            to="/"
            className="block mt-6 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            ← Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen items-center justify-center bg-surface-base">
      <div className="w-full max-w-sm px-6">

        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M3 11 C5 11 6 7.5 8.5 7.5 C11 7.5 12 14.5 14.5 14.5 C17 14.5 18 11 19 11"
                  stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="text-slate-100 font-bold text-xl tracking-tight">TradeTropics</span>
          </div>
          <p className="text-slate-400 text-sm">Reset your password</p>
        </div>

        <div className="border-t border-glass mb-6" />

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">Email</label>
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

          {error && (
            <p className="text-red-400 text-xs bg-red-400/8 border border-red-400/15 rounded-lg px-4 py-2.5">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-2.5 text-sm transition-colors"
          >
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link to="/" className="text-xs text-slate-400 hover:text-blue-400 transition-colors">
            ← Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
