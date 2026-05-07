import { create } from 'zustand'

export interface ChecklistItem {
  id: string
  text: string
  checked: boolean
}

const STORAGE_KEY = 'tt-checklist-items'

const DEFAULT_ITEMS: ChecklistItem[] = [
  { id: '1', text: 'HTF bias confirmed',              checked: false },
  { id: '2', text: 'Key level identified',             checked: false },
  { id: '3', text: 'Liquidity sweep seen',             checked: false },
  { id: '4', text: 'Entry model confirmed (BOS/MSS)',  checked: false },
  { id: '5', text: 'Session timing appropriate',       checked: false },
  { id: '6', text: 'News risk checked',                checked: false },
]

function loadItems(): ChecklistItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ChecklistItem[]) : DEFAULT_ITEMS
  } catch {
    return DEFAULT_ITEMS
  }
}

function persist(items: ChecklistItem[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)) } catch {}
}

interface ChecklistState {
  items: ChecklistItem[]
  toggle:      (id: string)   => void
  add:         (text: string) => void
  remove:      (id: string)   => void
  resetChecks: ()             => void
}

export const useChecklistStore = create<ChecklistState>((set, get) => ({
  items: loadItems(),

  toggle: (id) => {
    const items = get().items.map(i => i.id === id ? { ...i, checked: !i.checked } : i)
    persist(items)
    set({ items })
  },

  add: (text) => {
    const item: ChecklistItem = { id: `${Date.now()}`, text: text.trim(), checked: false }
    const items = [...get().items, item]
    persist(items)
    set({ items })
  },

  remove: (id) => {
    const items = get().items.filter(i => i.id !== id)
    persist(items)
    set({ items })
  },

  resetChecks: () => {
    const items = get().items.map(i => ({ ...i, checked: false }))
    persist(items)
    set({ items })
  },
}))
