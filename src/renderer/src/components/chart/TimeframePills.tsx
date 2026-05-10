import { useChartStore } from '@renderer/store/chartStore'
import { useAuthStore }  from '@renderer/store/authStore'
import { TF_ORDER, TF_LABEL, type Timeframe } from './types'

interface Props {
  disabledTfs?: Timeframe[]
}

export default function TimeframePills({ disabledTfs = [] }: Props): JSX.Element {
  const interval    = useChartStore(s => s.interval) as Timeframe
  const setInterval = useChartStore(s => s.setInterval)
  const userId      = useAuthStore(s => s.user?.id)
  const disabledSet = new Set(disabledTfs)

  return (
    <div className="flex items-center gap-0.5">
      {TF_ORDER.map(tf => {
        const disabled = disabledSet.has(tf)
        return (
          <button
            key={tf}
            onClick={() => !disabled && setInterval(tf, userId)}
            disabled={disabled}
            title={disabled ? 'Not supported by the selected data source' : undefined}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-all duration-150 ${
              disabled
                ? 'text-slate-600 cursor-not-allowed opacity-40'
                : interval === tf
                  ? 'bg-blue-500/15 text-blue-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
            }`}
          >
            {TF_LABEL[tf]}
          </button>
        )
      })}
    </div>
  )
}
