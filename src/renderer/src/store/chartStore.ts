import { create } from 'zustand'
import { supabase } from '@renderer/lib/supabase'

interface ChartState {
  symbol: string
  interval: string
  sessionLoaded: boolean
  setSymbol: (symbol: string, userId?: string) => void
  setInterval: (interval: string, userId?: string) => void
  loadSession: (userId: string) => Promise<void>
}

async function persistSession(userId: string, symbol: string, interval: string): Promise<void> {
  await supabase.from('sessions_meta').upsert(
    { user_id: userId, last_active_symbol: symbol, last_timeframe: interval },
    { onConflict: 'user_id' }
  )
}

export const useChartStore = create<ChartState>((set, get) => ({
  symbol: 'AAPL',
  interval: '1D',
  sessionLoaded: false,

  setSymbol: (symbol, userId) => {
    set({ symbol })
    if (userId) persistSession(userId, symbol, get().interval)
  },

  setInterval: (interval, userId) => {
    set({ interval })
    if (userId) persistSession(userId, get().symbol, interval)
  },

  loadSession: async (userId) => {
    try {
      const { data } = await supabase
        .from('sessions_meta')
        .select('last_active_symbol, last_timeframe')
        .eq('user_id', userId)
        .single()

      if (data) {
        // Migrate old TradingView interval format ('D'→'1D', 'W'→'1W')
        const tf = data.last_timeframe
        const interval = tf === 'D' ? '1D' : tf === 'W' ? '1W' : tf ?? '1D'
        set({ symbol: data.last_active_symbol ?? 'AAPL', interval })
      }
    } catch (err) {
      console.warn('[chartStore] loadSession failed, using defaults:', err)
    } finally {
      set({ sessionLoaded: true })
    }
  }
}))
