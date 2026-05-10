import { create } from 'zustand'

export interface Annotation {
  id:    string
  price: number
  color: string
  label: string
}

const STORAGE_KEY = 'tt-annotations'

function load(): Record<string, Annotation[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, Annotation[]>) : {}
  } catch {
    return {}
  }
}

function save(bySymbol: Record<string, Annotation[]>): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(bySymbol)) } catch {}
}

interface AnnotationState {
  bySymbol: Record<string, Annotation[]>
  getFor:  (symbol: string) => Annotation[]
  add:     (symbol: string, ann: Omit<Annotation, 'id'>) => void
  remove:  (symbol: string, id: string) => void
  clear:   (symbol: string) => void
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  bySymbol: load(),

  getFor: (symbol) => get().bySymbol[symbol] ?? [],

  add: (symbol, ann) => {
    const id = Math.random().toString(36).slice(2)
    const prev = get().bySymbol
    const next = { ...prev, [symbol]: [...(prev[symbol] ?? []), { ...ann, id }] }
    save(next)
    set({ bySymbol: next })
  },

  remove: (symbol, id) => {
    const prev = get().bySymbol
    const next = { ...prev, [symbol]: (prev[symbol] ?? []).filter(a => a.id !== id) }
    save(next)
    set({ bySymbol: next })
  },

  clear: (symbol) => {
    const prev = get().bySymbol
    const next = { ...prev, [symbol]: [] }
    save(next)
    set({ bySymbol: next })
  },
}))
