import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@renderer/store/authStore'
import { useSubscriptionConfirmation } from '@renderer/hooks/useSubscriptionConfirmation'

const FEATURES = [
  { label: 'Entry Score',        desc: 'Real-time 0–100 confidence rating on every chart' },
  { label: 'Trade Journal',      desc: 'Log trades, track P&L, and see your win rate' },
  { label: 'Backtester',         desc: 'Replay 6 years of historical bars and test strategies' },
  { label: 'Multi-asset charts', desc: 'Stocks, forex, and crypto on one platform' },
]

const LIFETIME_FULL_PRICE = 119
const LIFETIME_PRICE      = 25
const YEARLY_PRO_PRICE    = 99

function CheckIcon({ gold = false }: { gold?: boolean }): JSX.Element {
  return (
    <div className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
      gold
        ? 'bg-amber-400/15 border border-amber-400/25'
        : 'bg-blue-500/15 border border-blue-500/25'
    }`}>
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
        <path d="M1.5 4L3.2 5.8L6.5 2.2" stroke={gold ? '#fbbf24' : '#60a5fa'} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  )
}

function AwaitingPayment({ onCancel }: { onCancel: () => void }): JSX.Element {
  return (
    <div className="text-center px-6 py-8">
      <div className="w-14 h-14 rounded-full bg-blue-500/10 border border-blue-500/25 flex items-center justify-center mx-auto mb-5 shadow-[0_0_20px_rgba(59,130,246,0.12)]">
        <span className="w-5 h-5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin block" />
      </div>
      <h2 className="text-slate-100 font-semibold text-base mb-2">Complete your payment</h2>
      <p className="text-slate-400 text-sm leading-relaxed mb-1">
        Stripe checkout opened in your browser.
      </p>
      <p className="text-slate-500 text-xs mb-7">
        Your plan activates automatically once payment is confirmed.
      </p>
      <button
        onClick={onCancel}
        className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
      >
        Go back
      </button>
    </div>
  )
}

function PaymentTimeout(): JSX.Element {
  return (
    <div className="text-center px-6 py-8">
      <div className="w-14 h-14 rounded-full bg-slate-500/10 border border-slate-500/25 flex items-center justify-center mx-auto mb-5">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 6v4m0 4h.01M19 10a9 9 0 11-18 0 9 9 0 0118 0z"
            stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <h2 className="text-slate-100 font-semibold text-base mb-2">Payment received</h2>
      <p className="text-slate-400 text-sm leading-relaxed mb-1">
        It may take a moment to reflect in the app.
      </p>
      <p className="text-slate-500 text-xs">
        Contact{' '}
        <a href="mailto:support@tradetropics.com" className="text-blue-400 hover:text-blue-300 underline">
          support@tradetropics.com
        </a>{' '}
        if access hasn't updated within a few minutes.
      </p>
    </div>
  )
}

export default function PaywallPage(): JSX.Element {
  const user                  = useAuthStore((s) => s.user)
  const subscriptionStatus    = useAuthStore((s) => s.subscriptionStatus)
  const billingPeriod         = useAuthStore((s) => s.billingPeriod)
  const createCheckoutSession = useAuthStore((s) => s.createCheckoutSession)
  const fetchSubscription     = useAuthStore((s) => s.fetchSubscription)
  const signOut               = useAuthStore((s) => s.signOut)
  const navigate              = useNavigate()

  const [loadingPlan,     setLoadingPlan]     = useState<'monthly' | 'yearly' | 'lifetime' | null>(null)
  const [awaitingPayment, setAwaitingPayment] = useState(false)
  const [billing,         setBilling]         = useState<'monthly' | 'yearly'>('monthly')
  const [error,           setError]           = useState<string | null>(null)

  const isPro    = subscriptionStatus === 'active'
  const isYearly = billing === 'yearly'

  const isAnnualPro = isPro && billingPeriod === 'yearly'
  const lifetimePrice = isAnnualPro ? LIFETIME_PRICE : LIFETIME_FULL_PRICE

  const confirmationStatus = useSubscriptionConfirmation(user?.id, awaitingPayment)

  // When the hook confirms payment, refresh the store and navigate.
  useEffect(() => {
    if (confirmationStatus !== 'confirmed') return
    if (user?.id) fetchSubscription(user.id)
    navigate('/dashboard', { replace: true })
  }, [confirmationStatus, user?.id, fetchSubscription, navigate])

  const handleCheckout = async (plan: 'monthly' | 'yearly' | 'lifetime') => {
    setError(null)
    setLoadingPlan(plan)
    const err = await createCheckoutSession(plan)
    setLoadingPlan(null)
    if (err) { setError(err); return }
    setAwaitingPayment(true)
  }

  const BrandHeader = (
    <div className="text-center mb-8 relative">
      {!awaitingPayment && (
        <button
          aria-label="Close"
          onClick={() => navigate('/dashboard')}
          className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-surface-2 border border-glass hover:border-glass-strong flex items-center justify-center text-slate-400 hover:text-slate-300 transition-colors text-sm"
        >
          ✕
        </button>
      )}
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

  // ── Pro user: show only lifetime upgrade ─────────────────────────────────────
  if (isPro) {
    const credited = billingPeriod === 'yearly'
    return (
      <div className="min-h-screen bg-surface-base flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {BrandHeader}
          <div
            className="bg-surface-1 border border-amber-400/20 rounded-2xl overflow-hidden shadow-glass"
            style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.06) 0%, transparent 50%)' }}
          >
            {awaitingPayment && confirmationStatus === 'timeout' ? (
              <PaymentTimeout />
            ) : awaitingPayment ? (
              <AwaitingPayment onCancel={() => setAwaitingPayment(false)} />
            ) : (
              <>
                <div className="px-6 pt-6 pb-5 border-b border-amber-400/15">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Lifetime Access</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-4xl font-bold text-slate-100 tabular-nums">${lifetimePrice}</span>
                    <span className="text-slate-400 text-sm">once</span>
                    {credited && (
                      <span className="ml-1 text-xs text-slate-400 line-through tabular-nums">
                        ${LIFETIME_FULL_PRICE}
                      </span>
                    )}
                  </div>
                  {credited ? (
                    <p className="text-xs text-amber-400/80 mt-1.5">
                      Your annual payment credited — just ${lifetimePrice} to go forever.
                    </p>
                  ) : (
                    <p className="text-slate-400 text-xs mt-1">One payment. Never billed again.</p>
                  )}
                </div>

                <div className="px-6 py-5 flex flex-col gap-3.5">
                  {FEATURES.map((f) => (
                    <div key={f.label} className="flex items-start gap-3">
                      <CheckIcon gold />
                      <div>
                        <p className="text-sm text-slate-200 font-medium leading-tight">{f.label}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{f.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="px-6 pb-6 flex flex-col gap-3">
                  {error && (
                    <p className="text-xs text-red-400 bg-red-400/8 border border-red-400/15 rounded-lg px-3 py-2 leading-relaxed">
                      {error}
                    </p>
                  )}
                  <button
                    onClick={() => handleCheckout('lifetime')}
                    disabled={!!loadingPlan}
                    className="w-full py-3 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/30 disabled:opacity-50 text-sm font-bold text-amber-400 transition-colors"
                  >
                    {loadingPlan === 'lifetime' ? 'Opening Stripe…' : `Own it forever — $${lifetimePrice}`}
                  </button>
                  <button onClick={signOut} className="text-xs text-slate-600 hover:text-slate-400 text-center transition-colors">
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Free / expired user: show Pro plans ──────────────────────────────────────
  const price       = isYearly ? 99 : 14
  const priceSuffix = isYearly ? '/year' : '/month'

  return (
    <div className="min-h-screen bg-surface-base flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {BrandHeader}

        <div className="bg-surface-1 border border-glass rounded-2xl overflow-hidden shadow-glass">
          {awaitingPayment && confirmationStatus === 'timeout' ? (
            <PaymentTimeout />
          ) : awaitingPayment ? (
            <AwaitingPayment onCancel={() => setAwaitingPayment(false)} />
          ) : (
            <>
              {/* Pricing header */}
              <div
                className="px-6 pt-6 pb-5 border-b border-glass"
                style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.08) 0%, transparent 60%)' }}
              >
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Pro</p>
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
                        −41%
                      </span>
                    </button>
                  </div>
                </div>

                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-bold text-slate-100 tabular-nums">${price}</span>
                  <span className="text-slate-400 text-sm">{priceSuffix}</span>
                  {isYearly && <span className="text-xs text-slate-400 ml-1">($8.25/mo)</span>}
                </div>
                {isYearly ? (
                  <div className="mt-1.5">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                      Save 41% vs monthly
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
                {error && (
                  <p className="text-xs text-red-400 bg-red-400/8 border border-red-400/15 rounded-lg px-3 py-2 leading-relaxed">
                    {error}
                  </p>
                )}
                <button
                  onClick={() => handleCheckout(billing)}
                  disabled={!!loadingPlan}
                  className="w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-sm font-bold text-white transition-colors"
                >
                  {loadingPlan && loadingPlan !== 'lifetime'
                    ? 'Opening Stripe…'
                    : isYearly ? 'Get Pro — $99/yr' : 'Get Pro — $14/mo'
                  }
                </button>

                <button onClick={signOut} className="text-xs text-slate-600 hover:text-slate-400 text-center transition-colors">
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs text-slate-600 mt-4">
          Get Pro first. Lifetime becomes available after that.
        </p>
      </div>
    </div>
  )
}
