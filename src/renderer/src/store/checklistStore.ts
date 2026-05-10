import { create } from 'zustand'
import { supabase } from '@renderer/lib/supabase'

export interface ChecklistItem {
  id: string
  text: string
  checked: boolean
  position: number
}

const DEFAULT_ITEMS: Omit<ChecklistItem, 'id'>[] = [
  { text: 'HTF bias confirmed',             checked: false, position: 0 },
  { text: 'Key level identified',            checked: false, position: 1 },
  { text: 'Liquidity sweep seen',            checked: false, position: 2 },
  { text: 'Entry model confirmed (BOS/MSS)', checked: false, position: 3 },
  { text: 'Session timing appropriate',      checked: false, position: 4 },
  { text: 'News risk checked',               checked: false, position: 5 },
]

interface ChecklistState {
  items: ChecklistItem[]
  loading: boolean
  loadItems:   (userId: string) => Promise<void>
  toggle:      (id: string) => Promise<void>
  add:         (userId: string, text: string) => Promise<void>
  remove:      (id: string) => Promise<void>
  resetChecks: (userId: string) => Promise<void>
}

export const useChecklistStore = create<ChecklistState>((set, get) => ({
  items: [],
  loading: false,

  loadItems: async (userId) => {
    set({ loading: true })
    const { data, error } = await supabase
      .from('checklist_items')
      .select('id, text, checked, position')
      .eq('user_id', userId)
      .order('position', { ascending: true })

    if (error) { set({ loading: false }); return }

    if (!data || data.length === 0) {
      // Seed defaults for new user
      const rows = DEFAULT_ITEMS.map(d => ({ ...d, user_id: userId }))
      const { data: inserted } = await supabase
        .from('checklist_items')
        .insert(rows)
        .select('id, text, checked, position')
      set({ items: (inserted ?? []) as ChecklistItem[], loading: false })
    } else {
      set({ items: data as ChecklistItem[], loading: false })
    }
  },

  toggle: async (id) => {
    const item = get().items.find(i => i.id === id)
    if (!item) return
    const checked = !item.checked
    set({ items: get().items.map(i => i.id === id ? { ...i, checked } : i) })
    await supabase.from('checklist_items').update({ checked }).eq('id', id)
  },

  add: async (userId, text) => {
    const position = get().items.length
    const { data } = await supabase
      .from('checklist_items')
      .insert({ user_id: userId, text: text.trim(), checked: false, position })
      .select('id, text, checked, position')
      .single()
    if (data) set({ items: [...get().items, data as ChecklistItem] })
  },

  remove: async (id) => {
    set({ items: get().items.filter(i => i.id !== id) })
    await supabase.from('checklist_items').delete().eq('id', id)
  },

  resetChecks: async (userId) => {
    set({ items: get().items.map(i => ({ ...i, checked: false })) })
    await supabase.from('checklist_items').update({ checked: false }).eq('user_id', userId)
  },
}))
