import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@renderer/store/authStore'

export function useIsPro(): boolean {
  const status = useAuthStore((s) => s.subscriptionStatus)
  return status === 'active' || status === 'lifetime'
}

export function useIsLifetime(): boolean {
  return useAuthStore((s) => s.subscriptionStatus) === 'lifetime'
}

interface Props {
  children: ReactNode
  label?: string
  description?: string
}

export default function ProGate({ children, label = 'Pro Feature', description }: Props): JSX.Element {
  const isPro    = useIsPro()
  const navigate = useNavigate()

  if (isPro) return <>{children}</>

  return (
    <div className="relative overflow-hidden rounded-lg">
      <div
        aria-hidden
        className="pointer-events-none select-none"
        style={{ filter: 'blur(5px) hue-rotate(195deg) saturate(1.4) brightness(0.65)' }}
      >
        {children}
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-base/70 backdrop-blur-sm">
        <div className="text-center px-4">
          <div className="w-9 h-9 rounded-full bg-surface-3 border border-glass-strong flex items-center justify-center mx-auto mb-3">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="2" y="6" width="10" height="7" rx="1.5" stroke="#94a3b8" strokeWidth="1.3"/>
              <path d="M4.5 6V4.5a2.5 2.5 0 0 1 5 0V6" stroke="#94a3b8" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </div>
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest mb-1">{label}</p>
          {description && (
            <p className="text-slate-400 text-xs mb-3 leading-snug">{description}</p>
          )}
          <button
            onClick={() => navigate('/paywall')}
            className="mt-1 px-4 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-400 text-xs font-bold text-white transition-colors"
          >
            Upgrade to Pro
          </button>
        </div>
      </div>
    </div>
  )
}
