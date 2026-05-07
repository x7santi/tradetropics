import { create } from 'zustand'
import type { EntryScoreResult } from '@renderer/lib/confidence'
import type { Candle } from '@renderer/lib/finnhub'
import { supabase } from '@renderer/lib/supabase'

export const REPORTS_PER_DAY = 10
export const REPORT_WINDOW_MS = 12 * 3_600_000
export const COOLDOWN_MS     = 60_000  // 1 minute per symbol

// Cooldowns are per-device (localStorage) — this is intentional UX
const COOLDOWNS_KEY = 'tt_cooldowns'

function loadCooldowns(): Record<string, number> {
  try {
    const raw = localStorage.getItem(COOLDOWNS_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return {}
}

function saveCooldowns(c: Record<string, number>) {
  try { localStorage.setItem(COOLDOWNS_KEY, JSON.stringify(c)) } catch { /* ignore */ }
}

// Read state is per-device (localStorage)
const READ_IDS_KEY = 'tt_read_report_ids'

function loadReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_IDS_KEY)
    if (raw) return new Set(JSON.parse(raw))
  } catch { /* ignore */ }
  return new Set()
}

function saveReadIds(ids: Set<string>) {
  try { localStorage.setItem(READ_IDS_KEY, JSON.stringify([...ids])) } catch { /* ignore */ }
}

function getWindowStart(): number {
  return Date.now() - REPORT_WINDOW_MS
}

function getResetAt(reports: ReportData[]): number {
  const windowStart = getWindowStart()
  const windowReports = reports.filter(r => r.generatedAt > windowStart)
  const oldest = windowReports.length > 0 ? Math.min(...windowReports.map(r => r.generatedAt)) : 0

  return oldest > 0 ? oldest + REPORT_WINDOW_MS : Date.now() + REPORT_WINDOW_MS
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReportData {
  id: string
  symbol: string
  interval: string
  generatedAt: number
  analysis: EntryScoreResult
  candles: Candle[]
}

interface ReportState {
  isOpen:        boolean
  latestReport:  ReportData | null
  reports:       ReportData[]
  loading:       boolean
  // quota — derived from Supabase, cross-device accurate
  usageCount:    number
  resetAt:       number
  // cooldowns — per-device only
  cooldowns:     Record<string, number>
  // whether the latest open action originated from the /reports page
  openedFromReports: boolean
  // read tracking — per-device only
  readIds:          Set<string>
  // increments each time a new report is successfully generated (used to trigger sidebar shake)
  newReportSignal:  number
  reportGeneration: {
    active:   boolean
    progress: number
  }

  openReport:           () => void
  closeReport:          () => void
  openReportById:       (id: string, fromReports?: boolean) => void
  remainingReports:     () => number
  unreadCount:          () => number
  markAsRead:           (id: string) => void
  setReportGeneration:  (generation: { active: boolean; progress: number }) => void
  getCooldownRemaining: (symbol: string) => number
  fetchReports:         (userId: string) => Promise<void>
  takeReport:           (data: Omit<ReportData, 'id' | 'generatedAt'>, userId: string) => Promise<{ ok: boolean; error?: string }>
  deleteReport:         (id: string) => Promise<void>
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useReportStore = create<ReportState>((set, get) => ({
  isOpen:       false,
  latestReport: null,
  reports:      [],
  loading:      false,
  usageCount:   0,
  resetAt:      Date.now() + REPORT_WINDOW_MS,
  cooldowns:    loadCooldowns(),
  openedFromReports: false,
  readIds:         loadReadIds(),
  newReportSignal: 0,
  reportGeneration: {
    active:   false,
    progress: 0,
  },

  openReport:  () => set({ isOpen: true, openedFromReports: false }),
  closeReport: () => set({ isOpen: false, openedFromReports: false }),

  openReportById: (id, fromReports = false) => {
    const report = get().reports.find(r => r.id === id)
    if (report) set({ latestReport: report, isOpen: true, openedFromReports: fromReports })
  },

  remainingReports: () => {
    const { usageCount } = get()
    return Math.max(0, REPORTS_PER_DAY - usageCount)
  },

  unreadCount: () => {
    const { reports, readIds } = get()
    return reports.filter(r => !readIds.has(r.id)).length
  },

  markAsRead: (id) => {
    const ids = new Set(get().readIds)
    if (ids.has(id)) return
    ids.add(id)
    saveReadIds(ids)
    set({ readIds: ids })
  },

  setReportGeneration: (generation) => {
    set({
      reportGeneration: {
        active:   generation.active,
        progress: Math.max(0, Math.min(100, generation.progress)),
      },
    })
  },

  getCooldownRemaining: (symbol) => {
    const exp = get().cooldowns[symbol] ?? 0
    return Math.max(0, exp - Date.now())
  },

  fetchReports: async (userId) => {
    set({ loading: true })
    try {
      const { data, error } = await supabase
        .from('reports')
        .select('*')
        .eq('user_id', userId)
        .order('generated_at', { ascending: false })
        .limit(100)

      if (error) {
        console.warn('[Reports] fetch error:', error.message)
        return
      }

      const reports: ReportData[] = (data ?? []).map((row: any) => ({
        id:          row.id,
        symbol:      row.symbol,
        interval:    row.interval,
        generatedAt: row.generated_at,
        analysis:    row.analysis as EntryScoreResult,
        candles:     row.candles as Candle[],
      }))

      const windowStart = getWindowStart()
      const { count, error: countErr } = await supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gt('generated_at', windowStart)

      if (countErr) console.warn('[Reports] usage count error:', countErr.message)

      const usageCount = countErr
        ? reports.filter(r => r.generatedAt > windowStart).length
        : count ?? 0
      const resetAt = getResetAt(reports)

      set({
        reports,
        usageCount,
        resetAt,
        latestReport: get().latestReport ?? reports[0] ?? null,
      })
    } catch (err) {
      console.warn('[Reports] fetch exception:', err)
    } finally {
      set({ loading: false })
    }
  },

  takeReport: async (data, userId) => {
    const { cooldowns } = get()

    // Per-device cooldown check (fast, no network)
    const cooldownExp = cooldowns[data.symbol] ?? 0
    if (Date.now() < cooldownExp) {
      const sec = Math.ceil((cooldownExp - Date.now()) / 1000)
      return { ok: false, error: `${data.symbol} cooldown: ${sec}s remaining.` }
    }

    // Cross-device 12-hour limit — query Supabase to prevent multi-device abuse.
    const { count, error: countErr } = await supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gt('generated_at', getWindowStart())

    if (countErr) {
      console.warn('[Reports] usage count failed:', countErr.message)
      return { ok: false, error: 'Could not verify your report quota. Please try again.' }
    }

    if ((count ?? 0) >= REPORTS_PER_DAY) {
      set({ usageCount: count ?? REPORTS_PER_DAY })
      return { ok: false, error: `Limit of ${REPORTS_PER_DAY} reports per 12 hours reached across all your devices.` }
    }

    const report: ReportData = {
      ...data,
      id:          crypto.randomUUID(),
      generatedAt: Date.now(),
    }

    // Persist to Supabase
    const { error } = await supabase.from('reports').insert({
      id:           report.id,
      user_id:      userId,
      symbol:       report.symbol,
      interval:     report.interval,
      generated_at: report.generatedAt,
      analysis:     report.analysis,
      candles:      report.candles,
    })

    if (error) {
      console.warn('[Reports] save failed:', error.message)
      return { ok: false, error: 'Report could not be saved. Your quota was not used.' }
    }

    const newCooldowns = { ...cooldowns, [data.symbol]: Date.now() + COOLDOWN_MS }
    saveCooldowns(newCooldowns)

    const reports = [report, ...get().reports]
    set({
      latestReport:    report,
      reports,
      usageCount:      Math.min(REPORTS_PER_DAY, (count ?? get().usageCount) + 1),
      resetAt:         getResetAt(reports),
      cooldowns:       newCooldowns,
      newReportSignal: get().newReportSignal + 1,
    })

    return { ok: true }
  },

  deleteReport: async (id) => {
    const { reports, latestReport, isOpen } = get()
    const newReports   = reports.filter(r => r.id !== id)
    const deletingOpen = latestReport?.id === id

    // Don't recompute usage — deleting a report doesn't restore the quota
    set({
      reports,
      latestReport: deletingOpen ? (newReports[0] ?? null) : latestReport,
      isOpen:       deletingOpen ? false : isOpen,
    })

    // Small delay so the UI updates before we remove from the list
    setTimeout(() => set({ reports: newReports }), 150)

    const { error } = await supabase.from('reports').delete().eq('id', id)
    if (error) console.warn('[Reports] delete failed:', error.message)
  },
}))
