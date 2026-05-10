import { useState, useEffect, useRef } from 'react'
import Layout from '@renderer/components/Layout'
import { useDevLogStore, type LogEntry } from '@renderer/store/devLogStore'
import { useAuthStore } from '@renderer/store/authStore'
import { useTradesStore, type FakeTradeRow } from '@renderer/store/tradesStore'

const SOURCE_COLORS: Record<string, string> = {
  twelvedata: 'text-blue-400',
  biquote:    'text-purple-400',
  yahoo:      'text-orange-400',
  system:     'text-slate-400',
}

function formatTs(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function LogRow({ entry }: { entry: LogEntry }): JSX.Element {
  return (
    <div className={`flex items-start gap-3 px-4 py-2.5 border-b border-glass/50 hover:bg-white/[0.02] transition-colors ${entry.critical ? 'bg-red-500/5' : ''}`}>
      <span className="font-mono text-[10px] text-slate-600 shrink-0 mt-0.5 tabular-nums">
        {formatTs(entry.ts)}
      </span>
      <span className={`text-[10px] font-semibold uppercase tracking-wider shrink-0 mt-0.5 w-20 ${entry.critical ? 'text-red-400' : (SOURCE_COLORS[entry.source] ?? 'text-slate-400')}`}>
        {entry.critical ? '!! ' : ''}{entry.source}
      </span>
      <span className={`text-xs font-mono leading-relaxed break-all ${entry.critical ? 'text-red-300' : 'text-slate-300'}`}>
        {entry.message}
      </span>
    </div>
  )
}

type ConsoleEntry = { id: string; text: string; isResponse: boolean; isError?: boolean }

// ── Fake trade generation ─────────────────────────────────────────────────────

const AI_SYMBOLS: { s: string; p: number }[] = [
  { s: 'EURUSD', p: 1.0850 },
  { s: 'GBPUSD', p: 1.2700 },
  { s: 'XAUUSD', p: 2300.0 },
  { s: 'USDJPY', p: 149.50 },
  { s: 'NQ',     p: 17500.0 },
  { s: 'ES',     p: 5200.0  },
  { s: 'BTCUSD', p: 65000.0 },
  { s: 'SPX',    p: 5200.0  },
]

function seededRand(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

function buildFakeTrades(
  userId: string,
  dateStr: string,
  isProfit: boolean,
  totalAmount: number,
  multiplier: number,
): FakeTradeRow[] {
  const clampedMult = Math.max(1, Math.min(10000, multiplier))
  const avgPerTrade = clampedMult * 5
  const nTrades     = Math.max(1, Math.round(totalAmount / avgPerTrade))
  const rand        = seededRand(parseInt(dateStr.replace(/-/g, ''), 10) ^ (multiplier * 31))

  const rows: FakeTradeRow[] = []
  let remaining = totalAmount

  for (let i = 0; i < nTrades; i++) {
    const isLast   = i === nTrades - 1
    const pnlAbs   = isLast
      ? Math.max(0.01, remaining)
      : Math.min(remaining * 0.85, clampedMult * (1 + rand() * 9))

    remaining -= pnlAbs
    const pnl  = parseFloat((isProfit ? pnlAbs : -pnlAbs).toFixed(2))

    const sym   = AI_SYMBOLS[i % AI_SYMBOLS.length]
    const entry = parseFloat((sym.p * (1 + (rand() - 0.5) * 0.002)).toFixed(5))
    const exit  = parseFloat((entry + pnl).toFixed(5))

    const hour  = 8 + Math.floor((i / nTrades) * 9)
    const min   = Math.floor(rand() * 60)
    const sec   = Math.floor(rand() * 60)
    const opened_at = `${dateStr}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}Z`

    rows.push({
      symbol:     sym.s,
      direction:  'long',
      entry,
      exit_price: exit,
      size:       1,
      pnl,
      notes:      `[AI] Day ${dateStr.replace(/-/g, '')} · ×${clampedMult}`,
      opened_at,
    })
  }

  return rows
}

function parseDayId(raw: string): string | null {
  const cleaned = raw.replace(/-/g, '')
  if (!/^\d{8}$/.test(cleaned)) return null
  const y = cleaned.slice(0, 4)
  const m = cleaned.slice(4, 6)
  const d = cleaned.slice(6, 8)
  const dt = new Date(`${y}-${m}-${d}T12:00:00Z`)
  if (isNaN(dt.getTime())) return null
  return `${y}-${m}-${d}`
}

// ── Simple sync commands ──────────────────────────────────────────────────────

const SYNC_COMMANDS: Record<string, () => string> = {
  '/ping':    () => 'pong',
  '/version': () => `TradeTropics v${__APP_VERSION__}`,
  '/clear':   () => '__clear__',
  '/help':    () => 'Commands: /ping  /version  /clear  /aisetdaypl  /help',
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DevLogPage(): JSX.Element {
  const logs     = useDevLogStore(s => s.logs)
  const clearLog = useDevLogStore(s => s.clearLog)
  const markRead = useDevLogStore(s => s.markRead)
  const user     = useAuthStore(s => s.user)
  const insertFakeTrades = useTradesStore(s => s.insertFakeTrades)

  const [input,    setInput]    = useState('')
  const [busy,     setBusy]     = useState(false)
  const [console_, setConsole_] = useState<ConsoleEntry[]>([])
  const inputRef   = useRef<HTMLInputElement>(null)
  const consoleRef = useRef<HTMLDivElement>(null)

  useEffect(() => { markRead() }, [markRead])

  const push = (text: string, isResponse = true, isError = false) =>
    setConsole_(prev => [...prev, { id: crypto.randomUUID(), text, isResponse, isError }])

  const handleSubmit = async () => {
    const cmd = input.trim()
    if (!cmd || busy) return
    setInput('')
    push(cmd, false)

    if (!cmd.startsWith('/')) {
      push('Commands must start with /  — try /help', true, true)
      return
    }

    const parts = cmd.split(/\s+/)
    const base  = parts[0].toLowerCase()

    // ── /aisetdaypl ───────────────────────────────────────────────────────────
    if (base === '/aisetdaypl') {
      if (parts.length < 5) {
        push('Usage:  /aisetdaypl <day-id> <profit|loss> <amount> <multiplier>')
        push('')
        push('  day-id     · YYYYMMDD — shown at bottom of any day when devtools are on')
        push('  profit|loss · direction of the simulated day')
        push('  amount      · total P&L in dollars, e.g. 500 or $2500')
        push('  multiplier  · 1–10 000  (scale per trade; 1 = $1–10, 10 000 = $50k–$100k)')
        push('')
        push('Example:  /aisetdaypl 20260508 profit $1000 100')
        return
      }

      const dateStr = parseDayId(parts[1])
      if (!dateStr) {
        push(`Invalid day-id "${parts[1]}" — expected YYYYMMDD (e.g. 20260508)`, true, true)
        return
      }

      const dir = parts[2].toLowerCase()
      if (dir !== 'profit' && dir !== 'loss') {
        push(`Expected "profit" or "loss", got "${parts[2]}"`, true, true)
        return
      }

      const rawAmount = parts[3].replace(/^\$/, '')
      const amount    = parseFloat(rawAmount)
      if (isNaN(amount) || amount <= 0) {
        push(`Invalid amount "${parts[3]}"`, true, true)
        return
      }

      const multiplier = parseInt(parts[4], 10)
      if (isNaN(multiplier) || multiplier < 1 || multiplier > 10000) {
        push(`Multiplier must be 1–10 000, got "${parts[4]}"`, true, true)
        return
      }

      if (!user?.id) {
        push('Not signed in — cannot insert trades', true, true)
        return
      }

      const isProfit = dir === 'profit'
      const rows     = buildFakeTrades(user.id, dateStr, isProfit, amount, multiplier)

      push(`Generating ${rows.length} fake trade${rows.length !== 1 ? 's' : ''} for ${dateStr}…`)
      setBusy(true)
      const result = await insertFakeTrades(user.id, rows)
      setBusy(false)

      if (result.ok) {
        push(`[AI] Inserted ${result.count} trade${result.count !== 1 ? 's' : ''} for ${dateStr}`)
        push(`     ${isProfit ? '+' : '-'}$${amount.toFixed(2)} ${dir}  ·  ×${multiplier} multiplier`)
      } else {
        push(`Insert failed: ${result.error}`, true, true)
      }
      return
    }

    // ── simple commands ───────────────────────────────────────────────────────
    const fn = SYNC_COMMANDS[base]
    if (!fn) {
      push(`Unknown command: ${base} — type /help`, true, true)
      return
    }
    const result = fn()
    if (result === '__clear__') { setConsole_([]); return }
    push(result)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit()
  }

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    }
  }, [console_])

  return (
    <Layout>
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-glass shrink-0 flex items-center justify-between">
          <div>
            <h1 className="text-slate-100 text-lg font-semibold">Log</h1>
            <p className="text-slate-500 text-xs mt-0.5">
              Data feed events — {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
            </p>
          </div>
          {logs.length > 0 && (
            <button
              onClick={clearLog}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors px-3 py-1.5 rounded-lg border border-glass hover:border-glass-strong"
            >
              Clear
            </button>
          )}
        </div>

        {/* Log list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-600">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="7" y1="8" x2="17" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="7" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="7" y1="16" x2="11" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <p className="text-xs">No events recorded</p>
            </div>
          ) : (
            <div className="divide-y divide-glass/30">
              {logs.map(entry => <LogRow key={entry.id} entry={entry} />)}
            </div>
          )}
        </div>

        {/* Console */}
        <div className="shrink-0 border-t border-glass bg-surface-1">
          {console_.length > 0 && (
            <div
              ref={consoleRef}
              className="max-h-44 overflow-y-auto px-4 py-2 font-mono text-xs border-b border-glass/50 space-y-0.5"
            >
              {console_.map(line => (
                <div
                  key={line.id}
                  className={
                    !line.isResponse ? 'text-slate-400' :
                    line.isError     ? 'text-red-400'   :
                    line.text === '' ? 'h-2'            :
                    'text-emerald-400'
                  }
                >
                  {line.text !== '' && (line.isResponse ? '← ' : '> ')}{line.text}
                </div>
              ))}
              {busy && (
                <div className="text-slate-500 animate-pulse">← working…</div>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 px-4 py-3">
            <span className="font-mono text-xs text-slate-600 shrink-0">{'>'}</span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={busy}
              placeholder="/help"
              className="flex-1 bg-transparent font-mono text-xs text-slate-300 placeholder:text-slate-700 focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || busy}
              className="text-[10px] font-mono text-slate-600 hover:text-slate-400 transition-colors disabled:opacity-30 px-2 py-1 rounded border border-glass/50 hover:border-glass"
            >
              {busy ? '…' : 'run'}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  )
}
