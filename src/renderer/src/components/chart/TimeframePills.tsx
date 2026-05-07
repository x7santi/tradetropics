import { useChartStore } from '@renderer/store/chartStore'
import { useAuthStore }  from '@renderer/store/authStore'
import { TF_ORDER, TF_LABEL, type Timeframe } from './types'

export default function TimeframePills(): JSX.Element {
  const interval = useChartStore(s => s.interval) as Timeframe
  const setInterval = useChartStore(s => s.setInterval)
  const userId   = useAuthStore(s => s.user?.id)

  return (
    <div className="flex items-center gap-0.5">
      {TF_ORDER.map(tf => (
        <button
          key={tf}
          onClick={() => setInterval(tf, userId)}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-all duration-150 ${
            interval === tf
              ? 'bg-blue-500/15 text-blue-400'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
          }`}
        >
          {TF_LABEL[tf]}
        </button>
      ))}
    </div>
  )
}
