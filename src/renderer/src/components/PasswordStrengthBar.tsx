import { scorePassword } from '@renderer/lib/passwordStrength'

const STRENGTH_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a']

const CHECKS = [
  { key: 'length',  label: '12+' },
  { key: 'upper',   label: 'A-Z' },
  { key: 'lower',   label: 'a-z' },
  { key: 'number',  label: '0-9' },
  { key: 'special', label: '!@#' },
] as const

export default function PasswordStrengthBar({ password }: { password: string }): JSX.Element | null {
  if (!password) return null

  const { score, checks, label } = scorePassword(password)
  const color = STRENGTH_COLORS[score]

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-[3px] flex-1 rounded-full transition-all duration-300"
            style={{ background: i < score ? color : 'rgba(255,255,255,0.08)' }}
          />
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono transition-colors" style={{ color }}>
          {label}
        </span>
        <div className="flex gap-2">
          {CHECKS.map(({ key, label: l }) => (
            <span
              key={key}
              className={`text-[9px] font-mono transition-colors ${
                checks[key] ? 'text-emerald-400' : 'text-slate-700'
              }`}
            >
              {l}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
