import { create } from 'zustand'
import { supabase } from '@renderer/lib/supabase'

interface FavoritesState {
  favorites: string[]
  fetch: (userId: string) => Promise<void>
  toggle: (userId: string | undefined, symbol: string) => void
  isFavorite: (symbol: string) => boolean
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  favorites: [],

  fetch: async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('favourite_symbols')
      .eq('id', userId)
      .single()
    if (data?.favourite_symbols) set({ favorites: data.favourite_symbols as string[] })
  },

  toggle: (userId, symbol) => {
    const { favorites } = get()
    const next = favorites.includes(symbol)
      ? favorites.filter(s => s !== symbol)
      : [...favorites, symbol]
    set({ favorites: next })
    if (!userId) return
    supabase.from('profiles').update({ favourite_symbols: next }).eq('id', userId).then()
  },

  isFavorite: (symbol) => get().favorites.includes(symbol),
}))
