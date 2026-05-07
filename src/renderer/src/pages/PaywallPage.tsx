import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@renderer/store/authStore'

const FEATURES = [
  { label: 'Entry Score',        desc: 'Real-time 0–100 confidence rating on every chart' },
  { label: 'Economic Calendar',  desc: 'High-impact events fed directly into your score' },
  { label: 'Trade Journal',      desc: 'Log trades, track P&L, and see your win rate' },
  { label: 'Multi-asset charts', desc: 'Stocks, forex, and crypto on one platform' },
]

function CheckIcon(): JSX.Element {
  return (
    <div className="mt-0.5 w-4 h-4 rounded-full bg-blue-500/15 border border-blue-500/25 flex items-center justify-center shrink-0">
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
        <path d="M1.5 4L3.2 5.8L6.5 2.2" stroke="#60a5fa" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  )
}

const LIFETIME_PRICE   = 119
const YEARLY_PRO_PRICE = 79

export default function PaywallPage(): JSX.Element {
  const user               = useAuthStore((s) => s.user)
  const subscriptionStatus = useAuthStore((s) => s.subscriptionStatus)
  const billingPeriod      = useAuthStore((s) => s.billingPeriod)
  const activatePro        = useAuthStore((s) => s.activatePro)
  const activateLifetime   = useAuthStore((s) => s.activateLifetime)
  const signOut            = useAuthStore((s) => s.signOut)
  const navigate           = useNavigate()

  const [loadingPro,      setLoadingPro]      = useState(false)
  const [loadingLifetime, setLoadingLifetime] = useState(false)
  const [showLifetime,    setShowLifetime]    = useState(false)
  const [billing,         setBilling]         = useState<'monthly' | 'yearly'>('monthly')
  const [paywallError,    setPaywallError]    = useState<string | null>(null)

  const isPro    = subscriptionStatus === 'active'
  const isYearly = billing === 'yearly'

  // Lifetime pricing: Pro yearly users get their annual payment credited
  const lifetimePrice = isPro && billingPeriod === 'yearly'
    ? LIFETIME_PRICE - YEARLY_PRO_PRICE
    : LIFETIME_PRICE

  const handlePro = async () => {
    if (!user) return
    setPaywallError(null)
    setLoadingPro(true)
    const err = await activatePro(user.id, billing)
    setLoadingPro(false)
    if (err) {
      setPaywallError(err)
      return
    }
    navigate('/dashboard', { replace: true })
  }

  const handleLifetime = async () => {
    if (!user) return
    setPaywallError(null)
    setLoadingLifetime(true)
    const err = await activateLifetime(user.id)
    setLoadingLifetime(false)
    if (err) {
      setPaywallError(err)
      return
    }
    navigate('/dashboard', { replace: true })
  }

  const BrandHeader = (
    <div className="text-center mb-8 relative">
      <button
        aria-label="Close"
        onClick={() => navigate('/dashboard')}
        className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-surface-2 border border-glass hover:border-glass-strong flex items-center justify-center text-slate-400 hover:text-slate-300 transition-colors text-sm"
      >
        ✕
      </button>
      <div className="flex items-center justify-center gap-2.5 mb-3">
        <svg width="28" height="28" viewBox="0 0 22 22" fill="none">
          <rect width="22" height="22" rx="6" fill="rgba(59,130,246,0.12)"/>
          <path d="M4 11 C6 11 7 8 9 8 C11 8 12 14 14 14 C16 14 17 11 18 11"
            stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="text-slate-100 font-semibold text-base tracking-tight">TradeTropics</span>
      </div>
      <p className="text-slate-400 text-sm">
        {isPro ? "You're on Pro — ready to go lifetime?" : 'Unlock the full platform'}
      </p>
    </div>
  )

  // ── Pro user: show only the lifetime upgrade card ────────────────────────────
  if (isPro) {
    const credited = billingPeriod === 'yearly'
    return (
      <div className="min-h-screen bg-surface-base flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {BrandHeader}
          <div className="bg-surface-1 border border-amber-400/20 rounded-2xl overflow-hidden shadow-glass"
            style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.06) 0%, transparent 50%)' }}>

            <div className="px-6 pt-6 pb-5 border-b border-amber-400/15">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Lifetime Access</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-bold text-slate-100 tabular-nums">${lifetimePrice}</span>
                <span className="text-slate-400 text-sm">once</span>
                {credited && (
                  <span className="ml-1 text-xs text-slate-400 line-through tabular-nums">${LIFETIME_PRICE}</span>
                )}
              </div>
              {credited ? (
                <p className="text-xs text-amber-400/80 mt-1.5">
                  Your ${YEARLY_PRO_PRICE} annual payment credited — just ${lifetimePrice} to go forever.
                </p>
              ) : (
                <p className="text-slate-400 text-xs mt-1">One payment. Never billed again.</p>
              )}
            </div>

            <div className="px-6 py-5 flex flex-col gap-3.5">
              {FEATURES.map((f) => (
                <div key={f.label} className="flex items-start gap-3">
                  <div className="mt-0.5 w-4 h-4 rounded-full bg-amber-400/15 border border-amber-400/25 flex items-center justify-center shrink-0">
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M1.5 4L3.2 5.8L6.5 2.2" stroke="#fbbf24" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-slate-200 font-medium leading-tight">{f.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-6 pb-6 flex flex-col gap-3">
              {paywallError && (
                <p className="text-xs text-red-400 bg-red-400/8 border border-red-400/15 rounded-lg px-3 py-2 leading-relaxed">
                  {paywallError}
                </p>
              )}
              <button
                onClick={handleLifetime}
                disabled={loadingLifetime}
                className="w-full py-3 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/30 disabled:opacity-50 text-sm font-bold text-amber-400 transition-colors"
              >
                {loadingLifetime ? 'Processing…' : `Own it forever — $${lifetimePrice}`}
              </button>
              <p className="text-center text-xs text-slate-600">
                Stripe integration coming soon · payments are simulated
              </p>
              <button onClick={signOut} className="text-xs text-slate-600 hover:text-slate-400 text-center transition-colors">
                Sign out
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Free / expired user: show Pro plans, no lifetime ────────────────────────
  const price       = isYearly ? 79 : 8
  const priceSuffix = isYearly ? '/year' : '/month'

  return (
    <div className="min-h-screen bg-surface-base flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {BrandHeader}

        <div className="bg-surface-1 border border-glass rounded-2xl overflow-hidden shadow-glass">

          {/* Pricing header */}
          <div
            className="px-6 pt-6 pb-5 border-b border-glass"
            style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.08) 0%, transparent 60%)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-slate-400 uppercase tracking-wider">Pro</p>
              {/* Billing toggle */}
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-surface-3 border border-glass">
                <button
                  onClick={() => setBilling('monthly')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150 ${
                    !isYearly ? 'bg-surface-1 text-slate-200 shadow-glass-sm' : 'text-slate-400 hover:text-slate-400'
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBilling('yearly')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150 ${
                    isYearly ? 'bg-surface-1 text-slate-200 shadow-glass-sm' : 'text-slate-400 hover:text-slate-400'
                  }`}
                >
                  Yearly
                  <span className={`text-xs font-semibold transition-colors ${isYearly ? 'text-emerald-400' : 'text-slate-400'}`}>
                    −18%
                  </span>
                </button>
              </div>
            </div>

            <div className="flex items-baseline gap-1.5">
              <span className="text-4xl font-bold text-slate-100 tabular-nums">${price}</span>
              <span className="text-slate-400 text-sm">{priceSuffix}</span>
              {isYearly && <span className="text-xs text-slate-400 ml-1">($6.58/mo)</span>}
            </div>
            {isYearly ? (
              <div className="mt-1.5">
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  Save 18% vs monthly
                </span>
              </div>
            ) : (
              <p className="text-slate-400 text-xs mt-1">Cancel any time</p>
            )}
          </div>

          {/* Features */}
          <div className="px-6 py-5 flex flex-col gap-3.5">
            {FEATURES.map((f) => (
              <div key={f.label} className="flex items-start gap-3">
                <CheckIcon />
                <div>
                  <p className="text-sm text-slate-200 font-medium leading-tight">{f.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="px-6 pb-6 flex flex-col gap-3">
            {paywallError && (
              <p className="text-xs text-red-400 bg-red-400/8 border border-red-400/15 rounded-lg px-3 py-2 leading-relaxed">
                {paywallError}
              </p>
            )}
            <button
              onClick={handlePro}
              disabled={loadingPro}
              className="w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-sm font-bold text-white transition-colors"
            >
              {loadingPro ? 'Processing…' : isYearly ? 'Get Pro — $79/yr' : 'Get Pro — $8/mo'}
            </button>

            <p className="text-center text-xs text-slate-600">
              Stripe integration coming soon · payments are simulated
            </p>

            <button onClick={signOut} className="text-xs text-slate-600 hover:text-slate-400 text-center transition-colors">
              Sign out
            </button>
          </div>
        </div>

        {/* Lifetime teaser — only shown after they have Pro (hint for next visit) */}
        <p className="text-center text-xs text-slate-600 mt-4">
          Get Pro first. Lifetime becomes available after that.
        </p>
      </div>
    </div>
  )
}
