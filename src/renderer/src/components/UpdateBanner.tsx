import { useEffect, useState } from 'react'

type UpdateState = 'idle' | 'available' | 'downloaded'

export default function UpdateBanner(): JSX.Element | null {
  const [state,   setState]   = useState<UpdateState>('idle')
  const [version, setVersion] = useState<string>('')
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (!window.updater) return

    window.updater.onAvailable((info: any) => {
      setVersion(info?.version ?? '')
      setState('available')
    })

    window.updater.onDownloaded((info: any) => {
      setVersion(info?.version ?? '')
      setState('downloaded')
    })

    return () => window.updater.removeListeners()
  }, [])

  if (state === 'idle' || !visible) return null

  const isReady = state === 'downloaded'

  return (
    <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-4 py-2.5 rounded-xl border shadow-lg backdrop-blur-md transition-all duration-300
      ${isReady
        ? 'bg-blue-500/15 border-blue-500/30'
        : 'bg-surface-2/90 border-glass'}`}
    >
      {/* Icon */}
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isReady ? 'bg-blue-500/20' : 'bg-surface-3'}`}>
        {isReady ? (
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round">
            <path d="M7 1v8M4 6l3 3 3-3"/>
            <path d="M2 11h10"/>
          </svg>
        ) : (
          <div className="w-3 h-3 border-2 border-slate-400/40 border-t-slate-400 rounded-full animate-spin" />
        )}
      </div>

      {/* Text */}
      <div className="text-xs">
        {isReady ? (
          <span className="text-blue-300 font-medium">
            TradeTropics {version} is ready —{' '}
          </span>
        ) : (
          <span className="text-slate-400">
            Downloading update{version ? ` ${version}` : ''}…{' '}
          </span>
        )}
      </div>

      {/* Action */}
      {isReady && (
        <button
          onClick={() => window.updater.install()}
          className="text-xs font-semibold text-white bg-blue-500 hover:bg-blue-400 px-3 py-1 rounded-lg transition-colors shrink-0"
        >
          Restart now
        </button>
      )}

      {/* Dismiss */}
      <button
        onClick={() => setVisible(false)}
        className="text-slate-400 hover:text-slate-400 transition-colors ml-1 shrink-0"
        title="Dismiss"
      >
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M1 1l10 10M11 1L1 11"/>
        </svg>
      </button>
    </div>
  )
}
