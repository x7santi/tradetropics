import { create } from 'zustand'

const SETTINGS_KEY = 'tt_settings'

export interface CandleTheme {
  id: string
  name: string
  upColor: string
  downColor: string
  wickUpColor: string
  wickDownColor: string
  borderVisible?: boolean
  borderUpColor?: string
  borderDownColor?: string
  swatchBg: string
  warnOnDark?: boolean
}

export const CANDLE_THEMES: CandleTheme[] = [
  {
    id: 'teal-red', name: 'Teal / Red',
    upColor: '#00bfa5', downColor: '#f44336',
    wickUpColor: '#00bfa5', wickDownColor: '#f44336',
    swatchBg: '#0f1f38',
  },
  {
    id: 'green-red', name: 'Green / Red',
    upColor: '#00c853', downColor: '#f44336',
    wickUpColor: '#00c853', wickDownColor: '#f44336',
    swatchBg: '#0f1f38',
  },
  {
    id: 'blue-black', name: 'Blue / Black',
    upColor: '#2962ff', downColor: '#212121',
    wickUpColor: '#5c8aff', wickDownColor: '#4b5563',
    borderVisible: true, borderUpColor: '#000000', borderDownColor: '#212121',
    swatchBg: '#f0f5ff',
    warnOnDark: true,
  },
  {
    id: 'purple-orange', name: 'Purple / Orange',
    upColor: '#7c4dff', downColor: '#ff6d00',
    wickUpColor: '#aa80ff', wickDownColor: '#ff9a40',
    swatchBg: '#0f1f38',
  },
  {
    id: 'gold-red', name: 'Gold / Red',
    upColor: '#ffd600', downColor: '#dd2c00',
    wickUpColor: '#ffe54c', wickDownColor: '#ff6434',
    swatchBg: '#0f1f38',
  },
]

export type BgMode = 'dark' | 'light'

export const BG_COLORS: Record<BgMode, {
  bg: string; grid: string; text: string; border: string
}> = {
  dark:  { bg: '#0b1526', grid: 'rgba(255,255,255,0.04)', text: '#64748b', border: 'rgba(255,255,255,0.06)' },
  light: { bg: '#ffffff', grid: 'rgba(0,0,0,0.07)',        text: '#6b7280', border: 'rgba(0,0,0,0.1)'        },
}

export const POPULAR_TIMEZONES = [
  'America/New_York',   // NYSE / NASDAQ
  'Europe/London',      // LSE
  'Asia/Tokyo',         // JPX
  'Asia/Hong_Kong',     // HKEX
  'Australia/Sydney',   // ASX
]

interface Persisted {
  soundsEnabled: boolean
  candleThemeId: string
  chartBgMode: BgMode
  timezone: string | null   // null = use system auto timezone
  /** Trading Economics API key (https://tradingeconomics.com/api/). Empty = guest/demo or VITE_TRADING_ECONOMICS_API_KEY */
  tradingEconomicsApiKey: string
  devToolsEnabled: boolean
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return {
      soundsEnabled: true, candleThemeId: 'teal-red', chartBgMode: 'dark', timezone: null, tradingEconomicsApiKey: '', devToolsEnabled: false,
      ...JSON.parse(raw),
    }
  } catch { /* ignore */ }
  return { soundsEnabled: true, candleThemeId: 'teal-red', chartBgMode: 'dark', timezone: null, tradingEconomicsApiKey: '', devToolsEnabled: false }
}

function save(s: Persisted): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

interface SettingsState extends Persisted {
  setSoundsEnabled: (v: boolean) => void
  setCandleThemeId: (id: string) => void
  setChartBgMode: (mode: BgMode) => void
  setTimezone: (tz: string | null) => void
  setTradingEconomicsApiKey: (key: string) => void
  setDevToolsEnabled: (v: boolean) => void
  getCandleTheme: () => CandleTheme
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  const initial = load()
  return {
    ...initial,

    setSoundsEnabled: (soundsEnabled) => {
      save({ ...get(), soundsEnabled })
      set({ soundsEnabled })
    },

    setCandleThemeId: (candleThemeId) => {
      save({ ...get(), candleThemeId })
      set({ candleThemeId })
    },

    setChartBgMode: (chartBgMode) => {
      save({ ...get(), chartBgMode })
      set({ chartBgMode })
    },

    setTimezone: (timezone) => {
      save({ ...get(), timezone })
      set({ timezone })
    },

    setTradingEconomicsApiKey: (tradingEconomicsApiKey) => {
      save({ ...get(), tradingEconomicsApiKey })
      set({ tradingEconomicsApiKey })
    },

    setDevToolsEnabled: (devToolsEnabled) => {
      save({ ...get(), devToolsEnabled })
      set({ devToolsEnabled })
    },

    getCandleTheme: () =>
      CANDLE_THEMES.find(t => t.id === get().candleThemeId) ?? CANDLE_THEMES[0],
  }
})
