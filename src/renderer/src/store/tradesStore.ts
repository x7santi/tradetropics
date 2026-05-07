import { create } from 'zustand'
import { supabase } from '@renderer/lib/supabase'

export interface Trade {
  id: string
  user_id: string
  symbol: string
  direction: 'long' | 'short'
  entry: number
  exit_price: number | null
  size: number
  pnl: number | null
  notes: string | null
  opened_at: string
  created_at: string
}

export interface NewTrade {
  symbol: string
  direction: 'long' | 'short'
  entry: number
  exit_price?: number
  size: number
  notes?: string
}

interface TradesState {
  trades: Trade[]
  loading: boolean
  fetchTrades:  (userId: string) => Promise<void>
  addTrade:     (userId: string, trade: NewTrade) => Promise<{ ok: boolean; error?: string }>
  closeTrade:   (tradeId: string, exitPrice: number) => Promise<{ ok: boolean; error?: string }>
  deleteTrade:  (tradeId: string) => Promise<{ ok: boolean; error?: string }>
}

function computePnl(trade: NewTrade): number | null {
  if (trade.exit_price == null) return null
  return trade.direction === 'long'
    ? (trade.exit_price - trade.entry) * trade.size
    : (trade.entry - trade.exit_price) * trade.size
}

export const useTradesStore = create<TradesState>((set, get) => ({
  trades: [],
  loading: false,

  fetchTrades: async (userId) => {
    set({ loading: true })
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (!error && data) set({ trades: data as Trade[] })
    set({ loading: false })
  },

  addTrade: async (userId, trade) => {
    const { data, error } = await supabase
      .from('trades')
      .insert({
        user_id:    userId,
        symbol:     trade.symbol,
        direction:  trade.direction,
        entry:      trade.entry,
        exit_price: trade.exit_price ?? null,
        size:       trade.size,
        pnl:        computePnl(trade),
        notes:      trade.notes ?? null,
      })
      .select()
      .single()
    if (!error && data) {
      set((s) => ({ trades: [data as Trade, ...s.trades] }))
      return { ok: true }
    }
    console.error('[tradesStore] addTrade:', error?.message)
    return { ok: false, error: error?.message ?? 'Failed to save trade' }
  },

  closeTrade: async (tradeId, exitPrice) => {
    const trade = get().trades.find(t => t.id === tradeId)
    if (!trade) return { ok: false, error: 'Trade not found' }

    const pnl = trade.direction === 'long'
      ? (exitPrice - trade.entry) * trade.size
      : (trade.entry - exitPrice) * trade.size

    const { data, error } = await supabase
      .from('trades')
      .update({ exit_price: exitPrice, pnl })
      .eq('id', tradeId)
      .select()
      .single()

    if (!error && data) {
      set(s => ({ trades: s.trades.map(t => t.id === tradeId ? (data as Trade) : t) }))
      return { ok: true }
    }
    console.error('[tradesStore] closeTrade:', error?.message)
    return { ok: false, error: error?.message ?? 'Failed to close trade' }
  },

  deleteTrade: async (tradeId) => {
    const { error } = await supabase
      .from('trades')
      .delete()
      .eq('id', tradeId)

    if (!error) {
      set(s => ({ trades: s.trades.filter(t => t.id !== tradeId) }))
      return { ok: true }
    }

    console.error('[tradesStore] deleteTrade:', error?.message)
    return { ok: false, error: error?.message ?? 'Failed to delete trade' }
  },
}))
