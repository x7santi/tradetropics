import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import Layout from '@renderer/components/Layout'
import {
  useSettingsStore, CANDLE_THEMES, BG_COLORS, POPULAR_TIMEZONES,
  type CandleTheme, type BgMode,
} from '@renderer/store/settingsStore'
import { Volume2, VolumeX } from 'lucide-react'
import { playToggleOn } from '@renderer/lib/sounds'

function CandleSwatch({ theme }: { theme: CandleTheme }): JSX.Element {
  return (
    <svg width="36" height="38" viewBox="0 0 36 38" fill="none" style={{ borderRadius: 4, background: theme.swatchBg }}>
      <line x1="9"  y1="4"  x2="9"  y2="8"  stroke={theme.wickUpColor}   strokeWidth="1.5" strokeLinecap="round" />
      <rect x="5"   y="8"   width="8" height="13" rx="1" fill={theme.upColor}
        stroke={theme.borderVisible ? theme.borderUpColor : 'none'} strokeWidth={theme.borderVisible ? 1 : 0} />
      <line x1="9"  y1="21" x2="9"  y2="25" stroke={theme.wickUpColor}   strokeWidth="1.5" strokeLinecap="round" />
      <line x1="27" y1="10" x2="27" y2="14" stroke={theme.wickDownColor} strokeWidth="1.5" strokeLinecap="round" />
      <rect x="23"  y="14"  width="8" height="13" rx="1" fill={theme.downColor} />
      <line x1="27" y1="27" x2="27" y2="31" stroke={theme.wickDownColor} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export default function SettingsPage(): JSX.Element {
  const soundsEnabled    = useSettingsStore(s => s.soundsEnabled)
  const setSoundsEnabled = useSettingsStore(s => s.setSoundsEnabled)
  const candleThemeId    = useSettingsStore(s => s.candleThemeId)
  const setCandleThemeId = useSettingsStore(s => s.setCandleThemeId)
  const chartBgMode      = useSettingsStore(s => s.chartBgMode)
  const setChartBgMode   = useSettingsStore(s => s.setChartBgMode)
  const timezone         = useSettingsStore(s => s.timezone)
  const setTimezone      = useSettingsStore(s => s.setTimezone)
  const tradingEconomicsApiKey = useSettingsStore(s => s.tradingEconomicsApiKey)
  const setTradingEconomicsApiKey = useSettingsStore(s => s.setTradingEconomicsApiKey)
  const location         = useLocation()

  const [showDarkWarning,  setShowDarkWarning]  = useState(false)
  const [highlightTimezone, setHighlightTimezone] = useState(false)
  const tzRef = useRef<HTMLDivElement>(null)

  const activeTheme      = CANDLE_THEMES.find(t => t.id === candleThemeId)
  const autoTimezone     = Intl.DateTimeFormat().resolvedOptions().timeZone
  const isAutoAlreadyPopular = POPULAR_TIMEZONES.includes(autoTimezone)

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('highlight') !== 'timezone') return
    setHighlightTimezone(true)
    tzRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => setHighlightTimezone(false), 2000)
    return () => clearTimeout(t)
  }, [location.search])

  const handleSoundsToggle = () => {
    const next = !soundsEnabled
    setSoundsEnabled(next)
    if (next) playToggleOn()
  }

  const handleThemeClick = (theme: CandleTheme) => {
    if (theme.id === candleThemeId) return
    setCandleThemeId(theme.id)
    if (theme.warnOnDark && chartBgMode === 'dark') setChartBgMode('light')
  }

  const handleBgModeClick = (mode: BgMode) => {
    if (mode === chartBgMode) return
    if (mode === 'dark' && activeTheme?.warnOnDark) {
      setShowDarkWarning(true)
    } else {
      setChartBgMode(mode)
      setShowDarkWarning(false)
    }
  }

  const confirmDark = () => {
    setChartBgMode('dark')
    setShowDarkWarning(false)
  }

  return (
    <Layout>
      <style>{`
        @keyframes tz-pulse {
          0%   { box-shadow: 0 0 0 2px rgba(96,165,250,0.8), 0 0 12px 4px rgba(96,165,250,0.2); }
          50%  { box-shadow: 0 0 0 4px rgba(96,165,250,0.3), 0 0 28px 10px rgba(96,165,250,0.4); }
          100% { box-shadow: 0 0 0 2px rgba(96,165,250,0.8), 0 0 12px 4px rgba(96,165,250,0.2); }
        }
      `}</style>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-glass shrink-0">
          <h1 className="text-slate-100 text-lg font-semibold">Settings</h1>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-2xl flex flex-col gap-4">

            {/* Audio */}
            <div className="bg-surface-1 border border-glass rounded-lg p-6">
              <h2 className="text-slate-100 text-sm font-semibold uppercase tracking-wide mb-4">Audio</h2>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {soundsEnabled
                    ? <Volume2 size={18} className="text-slate-400" />
                    : <VolumeX  size={18} className="text-slate-400" />}
                  <div>
                    <p className="text-slate-300 text-sm font-medium">Sound Effects</p>
                    <p className="text-slate-400 text-xs mt-0.5">Mute/Unmute SFX</p>
                  </div>
                </div>
                <button
                  onClick={handleSoundsToggle}
                  className={`relative inline-flex items-center w-11 h-6 rounded-full transition-colors ${soundsEnabled ? 'bg-blue-500 hover:bg-blue-400' : 'bg-surface-3 hover:bg-surface-2'}`}
                >
                  <span className={`inline-block w-5 h-5 transform rounded-full bg-white shadow-md transition-transform ${soundsEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>

            {/* Chart */}
            <div className="bg-surface-1 border border-glass rounded-lg p-6">
              <h2 className="text-slate-100 text-sm font-semibold uppercase tracking-wide mb-5">Chart</h2>

              {/* Background toggle */}
              <div className="mb-6">
                <p className="text-slate-400 text-xs uppercase tracking-wide mb-3">Background</p>
                <div className="flex gap-2">
                  {(['dark', 'light'] as BgMode[]).map(mode => (
                    <button
                      key={mode}
                      onClick={() => handleBgModeClick(mode)}
                      className={`flex items-center gap-2.5 px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-150 ${
                        chartBgMode === mode
                          ? 'border-blue-500/60 bg-blue-500/10 text-blue-300'
                          : 'border-glass bg-surface-2 text-slate-400 hover:border-glass-strong hover:text-slate-300'
                      }`}
                    >
                      <span
                        className="w-4 h-4 rounded-sm border border-white/20 shrink-0"
                        style={{ background: BG_COLORS[mode].bg }}
                      />
                      {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </button>
                  ))}
                </div>

                {showDarkWarning && (
                  <div className="mt-3 p-4 rounded-xl border border-amber-500/25 bg-amber-500/6">
                    <div className="flex items-start gap-3">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 mt-0.5">
                        <path d="M8 1.5 L14.5 13H1.5Z" stroke="#f59e0b" strokeWidth="1.3" strokeLinejoin="round" />
                        <line x1="8" y1="6" x2="8" y2="9.5" stroke="#f59e0b" strokeWidth="1.3" strokeLinecap="round" />
                        <circle cx="8" cy="11.5" r="0.7" fill="#f59e0b" />
                      </svg>
                      <div className="flex-1">
                        <p className="text-amber-300 text-xs font-medium mb-1">Candles may not be visible</p>
                        <p className="text-amber-400/70 text-xs leading-relaxed">
                          The <span className="text-amber-300 font-medium">Blue / Black</span> theme uses near-black down candles that are hard to see on a dark background. Switch anyway?
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => setShowDarkWarning(false)}
                        className="px-3 py-1.5 rounded-lg text-xs text-slate-400 bg-surface-3 hover:bg-surface-2 border border-glass transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={confirmDark}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-amber-900 bg-amber-400 hover:bg-amber-300 transition-colors"
                      >
                        Switch anyway
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-glass mb-6" />

              {/* Candle theme */}
              <div>
                <p className="text-slate-400 text-xs uppercase tracking-wide mb-3">Candle Theme</p>
                <div className="grid grid-cols-5 gap-3">
                  {CANDLE_THEMES.map(theme => {
                    const active = candleThemeId === theme.id
                    return (
                      <button
                        key={theme.id}
                        onClick={() => handleThemeClick(theme)}
                        className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all duration-150 ${
                          active
                            ? 'border-blue-500/60 bg-blue-500/8'
                            : 'border-glass bg-surface-2 hover:border-glass-strong hover:bg-surface-3'
                        }`}
                      >
                        <CandleSwatch theme={theme} />
                        <span className="text-[10px] text-slate-400 text-center leading-tight">{theme.name}</span>
                        {active && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Timezone */}
            <div
              ref={tzRef}
              className="bg-surface-1 border border-glass rounded-lg p-6 transition-all duration-150"
              style={highlightTimezone ? { animation: 'tz-pulse 0.9s ease-in-out 2' } : {}}
            >
              <h2 className="text-slate-100 text-sm font-semibold uppercase tracking-wide mb-4">Timezone</h2>
              <div className="grid grid-cols-2 gap-2">

                {/* Auto */}
                <button
                  onClick={() => setTimezone(null)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-all duration-150 ${
                    timezone === null
                      ? 'border-blue-500/60 bg-blue-500/8'
                      : 'border-glass bg-surface-2 hover:border-glass-strong hover:bg-surface-3'
                  }`}
                >
                  <span className="text-xs text-slate-300 font-medium">(Auto)</span>
                  <span className="text-[10px] text-slate-400">{autoTimezone}</span>
                </button>

                {/* Popular market timezones */}
                {POPULAR_TIMEZONES.map(tz => {
                  const city         = tz.split('/')[1].replace(/_/g, ' ')
                  const sameAsAuto   = tz === autoTimezone
                  const isSelected   = timezone === tz
                  return (
                    <button
                      key={tz}
                      onClick={() => { if (!sameAsAuto) setTimezone(tz) }}
                      disabled={sameAsAuto}
                      title={sameAsAuto ? 'Already selected via Auto' : undefined}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-all duration-150 ${
                        isSelected
                          ? 'border-blue-500/60 bg-blue-500/8'
                          : sameAsAuto
                          ? 'border-glass bg-surface-2 opacity-50 cursor-not-allowed'
                          : 'border-glass bg-surface-2 hover:border-glass-strong hover:bg-surface-3'
                      }`}
                    >
                      <span className="text-xs text-slate-300 font-medium">{city}</span>
                      <span className="text-[10px] text-slate-400">{tz}</span>
                    </button>
                  )
                })}

              </div>
            </div>

            {/* Economic calendar API */}
            <div className="bg-surface-1 border border-glass rounded-lg p-6">
              <h2 className="text-slate-100 text-sm font-semibold uppercase tracking-wide mb-2">Economic calendar</h2>
              <p className="text-slate-400 text-xs leading-relaxed mb-4">
                TradeMind loads macro events from the{' '}
                <a
                  href="https://tradingeconomics.com/api/calendar.aspx"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
                >
                  Trading Economics Calendar API
                </a>
                . Leave empty to use limited demo access; a paid key unlocks the full calendar (CPI, central bank, holidays).
                Optional: set <span className="text-slate-400">VITE_FINNHUB_API_KEY</span> in .env to merge Finnhub economic calendar as a second source.
              </p>
              <label className="block">
                <span className="sr-only">Trading Economics API key</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={tradingEconomicsApiKey}
                  onChange={(e) => setTradingEconomicsApiKey(e.target.value)}
                  placeholder="API key (optional)"
                  className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-glass text-sm text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-blue-500/40 font-mono"
                />
              </label>
            </div>

          </div>
        </div>
      </div>
    </Layout>
  )
}
