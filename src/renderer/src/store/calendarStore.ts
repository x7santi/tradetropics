import { create } from 'zustand'
import { supabase } from '@renderer/lib/supabase'

export interface CalendarNote {
  date: string    // "YYYY-MM-DD"
  notes: string
  updatedAt: string
}

interface CalendarState {
  notes:         Record<string, CalendarNote>  // keyed by "YYYY-MM-DD"
  fetchedMonths: Set<string>                   // "YYYY-MM" keys already loaded
  saving:        Record<string, boolean>

  fetchNotes: (userId: string, year: number, month: number) => Promise<void>
  saveNote:   (userId: string, date: string, text: string) => Promise<{ ok: boolean; error?: string }>
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  notes:         {},
  fetchedMonths: new Set(),
  saving:        {},

  fetchNotes: async (userId, year, month) => {
    const key = `${year}-${String(month).padStart(2, '0')}`
    if (get().fetchedMonths.has(key)) return

    // Build date range for the month
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay   = new Date(year, month, 0).getDate()
    const endDate   = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const { data, error } = await supabase
      .from('calendar_notes')
      .select('date, notes, updated_at')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)

    if (error) {
      console.warn('[CalendarStore] fetch error:', error.message)
      return
    }

    const newNotes: Record<string, CalendarNote> = { ...get().notes }
    for (const row of data ?? []) {
      newNotes[row.date] = {
        date:      row.date,
        notes:     row.notes ?? '',
        updatedAt: row.updated_at,
      }
    }

    const fetchedMonths = new Set(get().fetchedMonths)
    fetchedMonths.add(key)
    set({ notes: newNotes, fetchedMonths })
  },

  saveNote: async (userId, date, text) => {
    // Optimistic update
    const notes = { ...get().notes }
    notes[date] = { date, notes: text, updatedAt: new Date().toISOString() }
    set(s => ({ notes, saving: { ...s.saving, [date]: true } }))

    const { error } = await supabase
      .from('calendar_notes')
      .upsert(
        { user_id: userId, date, notes: text, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,date' }
      )

    set(s => ({ saving: { ...s.saving, [date]: false } }))

    if (error) {
      console.warn('[CalendarStore] save error:', error.message)
      return { ok: false, error: error.message }
    }

    return { ok: true }
  },
}))
