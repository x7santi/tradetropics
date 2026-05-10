import { create } from 'zustand'

export type LogSource = 'twelvedata' | 'biquote' | 'yahoo' | 'system'

export interface LogEntry {
  id: string
  ts: number
  source: LogSource
  message: string
  critical?: boolean
}

interface DevLogState {
  logs: LogEntry[]
  unreadCount: number
  criticalUnread: boolean
  addLog: (source: LogSource, message: string, critical?: boolean) => void
  clearLog: () => void
  markRead: () => void
}

export const useDevLogStore = create<DevLogState>((set, get) => ({
  logs: [],
  unreadCount: 0,
  criticalUnread: false,

  addLog: (source, message, critical) => {
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      ts: Date.now(),
      source,
      message,
      critical,
    }
    set({
      logs: [entry, ...get().logs].slice(0, 500),
      unreadCount: get().unreadCount + 1,
      criticalUnread: critical ? true : get().criticalUnread,
    })
  },

  clearLog: () => set({ logs: [], unreadCount: 0, criticalUnread: false }),

  markRead: () => set({ unreadCount: 0, criticalUnread: false }),
}))
