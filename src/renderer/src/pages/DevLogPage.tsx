import { useState, useEffect, useRef, useCallback } from 'react'
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
    <div className={`flex items-start gap-3 px-4 py-2.5 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${entry.critical ? 'bg-red-500/5' : ''}`}>
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

type ConsoleLine = {
  id: string
  text: string
  kind: 'input' | 'output' | 'error' | 'blank'
  ts: number
}

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
    const pnl    = parseFloat((isProfit ? pnlAbs : -pnlAbs).toFixed(2))
    const sym    = AI_SYMBOLS[i % AI_SYMBOLS.length]
    const entry  = parseFloat((sym.p * (1 + (rand() - 0.5) * 0.002)).toFixed(5))
    const exit   = parseFloat((entry + pnl).toFixed(5))
    const hour   = 8 + Math.floor((i / nTrades) * 9)
    const min    = Math.floor(rand() * 60)
    const sec    = Math.floor(rand() * 60)
    const opened_at = `${dateStr}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}Z`
    rows.push({
      symbol: sym.s, direction: 'long', entry, exit_price: exit,
      size: 1, pnl,
      notes: `[AI] Day ${dateStr.replace(/-/g, '')} · ×${clampedMult}`,
      opened_at,
    })
  }

  return rows
}

function parseDayId(raw: string): string | null {
  const cleaned = raw.replace(/-/g, '')
  if (!/^\d{8}$/.test(cleaned)) return null
  const y = cleaned.slice(0, 4), m = cleaned.slice(4, 6), d = cleaned.slice(6, 8)
  const dt = new Date(`${y}-${m}-${d}T12:00:00Z`)
  if (isNaN(dt.getTime())) return null
  return `${y}-${m}-${d}`
}

// ── All known commands (for autocomplete + help) ──────────────────────────────

const COMMANDS: Record<string, string> = {
  '/ping':           'pong',
  '/version':        `TradeTropics v${__APP_VERSION__}`,
  '/clear':          '__clear__',
  '/help':           '__help__',
  '/reset-journal':  '__reset__',
  '/aisetdaypl':     '__aisetdaypl__',
}

const PUBLIC_COMMAND_HELP: [string, string][] = [
  ['/ping',           'Check console is alive'],
  ['/version',        'Print app version'],
  ['/clear',          'Clear console output'],
  ['/reset-journal',  'Delete ALL journal trades (requires /reset-journal confirm)'],
  ['/help',           'Show this help'],
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DevLogPage(): JSX.Element {
  const logs          = useDevLogStore(s => s.logs)
  const clearLog      = useDevLogStore(s => s.clearLog)
  const markRead      = useDevLogStore(s => s.markRead)
  const user          = useAuthStore(s => s.user)
  const { insertFakeTrades, fetchTrades, trades } = useTradesStore()
  const deleteTrade   = useTradesStore(s => s.deleteTrade)

  const [input,      setInput]      = useState('')
  const [busy,       setBusy]       = useState(false)
  const [lines,      setLines]      = useState<ConsoleLine[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const historyRef   = useRef<string[]>([])
  const inputRef     = useRef<HTMLInputElement>(null)
  const consoleRef   = useRef<HTMLDivElement>(null)
  const resetPending = useRef(false)

  useEffect(() => { markRead() }, [markRead])

  useEffect(() => {
    if (user?.id) fetchTrades(user.id)
  }, [user?.id, fetchTrades])

  const push = useCallback((text: string, kind: ConsoleLine['kind'] = 'output') => {
    setLines(prev => [...prev, { id: crypto.randomUUID(), text, kind, ts: Date.now() }])
  }, [])

  const allCmds = Object.keys(COMMANDS)
  const hint    = input.startsWith('/') ? allCmds.find(c => c.startsWith(input) && c !== input) ?? null : null
  const hintSuffix = hint ? hint.slice(input.length) : null

  const handleSubmit = useCallback(async () => {
    const cmd = input.trim()
    if (!cmd || busy) return
    setInput('')
    setHistoryIdx(-1)

    if (cmd !== historyRef.current[historyRef.current.length - 1]) {
      historyRef.current.push(cmd)
    }

    push(cmd, 'input')

    if (!cmd.startsWith('/')) {
      push('Commands must start with /  — try /help', 'error')
      return
    }

    const parts = cmd.split(/\s+/)
    const base  = parts[0].toLowerCase()

    // ── /aisetdaypl ───────────────────────────────────────────────────────────
    if (base === '/aisetdaypl') {
      if (parts.length < 5) {
        push('Usage:  /aisetdaypl <day-id> <profit|loss> <amount> <multiplier>')
        push('  day-id     · YYYYMMDD')
        push('  profit|loss · direction of the simulated day')
        push('  amount      · total P&L e.g. 500 or $2500')
        push('  multiplier  · 1–10 000')
        push('Example:  /aisetdaypl 20260508 profit $1000 100')
        return
      }
      const dateStr = parseDayId(parts[1])
      if (!dateStr) { push(`Invalid day-id "${parts[1]}" — expected YYYYMMDD`, 'error'); return }
      const dir = parts[2].toLowerCase()
      if (dir !== 'profit' && dir !== 'loss') { push(`Expected "profit" or "loss", got "${parts[2]}"`, 'error'); return }
      const rawAmount = parts[3].replace(/^\$/, '')
      const amount    = parseFloat(rawAmount)
      if (isNaN(amount) || amount <= 0) { push(`Invalid amount "${parts[3]}"`, 'error'); return }
      const multiplier = parseInt(parts[4], 10)
      if (isNaN(multiplier) || multiplier < 1 || multiplier > 10000) { push(`Multiplier must be 1–10 000, got "${parts[4]}"`, 'error'); return }
      if (!user?.id) { push('Not signed in', 'error'); return }
      const rows = buildFakeTrades(user.id, dateStr, dir === 'profit', amount, multiplier)
      push(`Generating ${rows.length} trade${rows.length !== 1 ? 's' : ''} for ${dateStr}…`)
      setBusy(true)
      const result = await insertFakeTrades(user.id, rows)
      setBusy(false)
      if (result.ok) {
        push(`✓ Inserted ${result.count} trade${result.count !== 1 ? 's' : ''} for ${dateStr}`)
        push(`  ${dir === 'profit' ? '+' : '-'}$${amount.toFixed(2)}  ×${multiplier} multiplier`)
      } else {
        push(`Insert failed: ${result.error}`, 'error')
      }
      return
    }

    // ── /reset-journal ────────────────────────────────────────────────────────
    if (base === '/reset-journal') {
      if (parts[1] === 'confirm') {
        if (!resetPending.current) {
          push('Run /reset-journal first to initiate the reset.', 'error')
          return
        }
        if (!user?.id) { push('Not signed in', 'error'); return }
        resetPending.current = false
        const count = trades.length
        if (count === 0) { push('No trades to delete.'); return }
        setBusy(true)
        push(`Deleting ${count} trade${count !== 1 ? 's' : ''}…`)
        let deleted = 0
        for (const t of trades) {
          const r = await deleteTrade(t.id)
          if (r.ok) deleted++
        }
        setBusy(false)
        push(`✓ Deleted ${deleted}/${count} trades. Journal is now empty.`)
      } else {
        const count = trades.length
        if (count === 0) { push('No trades in journal.'); return }
        resetPending.current = true
        push(`⚠ This will permanently delete ALL ${count} trade${count !== 1 ? 's' : ''}.`)
        push('  Type /reset-journal confirm to proceed, or any other command to cancel.')
      }
      return
    }

    // Cancel pending reset on any other command
    if (resetPending.current) {
      resetPending.current = false
      push('Reset cancelled.')
    }

    // ── simple commands ───────────────────────────────────────────────────────
    const result = COMMANDS[base]
    if (!result) { push(`Unknown command: ${base} — type /help`, 'error'); return }

    if (result === '__clear__') { setLines([]); return }

    if (result === '__help__') {
      push('─── TradeTropics DevConsole ───────────────')
      PUBLIC_COMMAND_HELP.forEach(([cmd, desc]) => {
        push(`  ${cmd.padEnd(22)} ${desc}`)
      })
      push('  ↑/↓                    Command history')
      push('  Tab                    Autocomplete')
      push('──────────────────────────────────────────')
      return
    }

    push(result)
  }, [input, busy, user, trades, insertFakeTrades, deleteTrade, push])

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { handleSubmit(); return }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const h = historyRef.current
      if (h.length === 0) return
      const next = Math.min(historyIdx + 1, h.length - 1)
      setHistoryIdx(next)
      setInput(h[h.length - 1 - next])
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIdx <= 0) { setHistoryIdx(-1); setInput(''); return }
      const next = historyIdx - 1
      setHistoryIdx(next)
      setInput(historyRef.current[historyRef.current.length - 1 - next])
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      if (hint) setInput(hint)
    }

    // Any key (not up/down) cancels pending reset silently
    if (!['ArrowUp', 'ArrowDown', 'Tab', 'Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
      if (resetPending.current && e.key !== 'Enter') {
        // will be handled on submit
      }
    }
  }

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    }
  }, [lines])

  return (
    <Layout>
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-white/[0.06] shrink-0 flex items-center justify-between">
          <div>
            <h1 className="text-slate-100 text-lg font-semibold">Dev Log</h1>
            <p className="text-slate-500 text-xs mt-0.5">
              Feed events — {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
            </p>
          </div>
          {logs.length > 0 && (
            <button
              onClick={clearLog}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors px-3 py-1.5 rounded-lg border border-white/[0.06] hover:border-white/[0.10]"
            >
              Clear log
            </button>
          )}
        </div>

        {/* Log list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-600">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="7" y1="8"  x2="17" y2="8"  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="7" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="7" y1="16" x2="11" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <p className="text-xs">No events recorded</p>
            </div>
          ) : (
            logs.map(entry => <LogRow key={entry.id} entry={entry} />)
          )}
        </div>

        {/* Console */}
        <div className="shrink-0 border-t border-white/[0.06] bg-white/[0.02] backdrop-blur-sm">
          {lines.length > 0 && (
            <div
              ref={consoleRef}
              className="max-h-52 overflow-y-auto px-4 py-3 font-mono text-xs border-b border-white/[0.05] space-y-0.5"
            >
              {lines.map((line, i) => {
                if (line.kind === 'blank') return <div key={line.id} className="h-2" />
                const isNewBlock = i > 0 && lines[i - 1].kind !== 'input' && line.kind === 'input'
                return (
                  <div key={line.id}>
                    {isNewBlock && <div className="h-3" />}
                    <div className={`flex items-start gap-2 leading-relaxed ${
                      line.kind === 'input'  ? 'text-slate-400' :
                      line.kind === 'error'  ? 'text-red-400'   :
                      'text-emerald-400'
                    }`}>
                      <span className="shrink-0 select-none text-slate-700">
                        {line.kind === 'input' ? '$' : line.kind === 'error' ? '✗' : '→'}
                      </span>
                      <span className="break-all">{line.text}</span>
                      {line.kind === 'input' && (
                        <span className="ml-auto shrink-0 text-[9px] text-slate-700 tabular-nums pl-4">
                          {formatTs(line.ts)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
              {busy && (
                <div className="flex items-center gap-2 text-slate-500 animate-pulse">
                  <span className="shrink-0">→</span>
                  <span>working…</span>
                </div>
              )}
            </div>
          )}

          {/* Input row */}
          <div className="flex items-center gap-2 px-4 py-3 relative">
            <span className="font-mono text-xs text-slate-600 shrink-0">$</span>
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => { setInput(e.target.value); setHistoryIdx(-1) }}
                onKeyDown={handleKey}
                disabled={busy}
                placeholder="/help"
                spellCheck={false}
                autoComplete="off"
                className="w-full bg-transparent font-mono text-xs text-slate-200 placeholder:text-slate-700 focus:outline-none disabled:opacity-50 caret-indigo-400"
              />
              {/* Autocomplete ghost text */}
              {hintSuffix && !busy && (
                <div className="absolute inset-0 pointer-events-none font-mono text-xs flex items-center">
                  <span className="invisible">{input}</span>
                  <span className="text-slate-700">{hintSuffix}</span>
                </div>
              )}
            </div>
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || busy}
              className="text-[10px] font-mono text-slate-600 hover:text-slate-400 transition-colors disabled:opacity-30 px-2 py-1 rounded border border-white/[0.06] hover:border-white/[0.10]"
            >
              {busy ? '…' : 'run'}
            </button>
          </div>

          {/* Hint bar */}
          <div className="px-4 pb-2 flex items-center gap-4 text-[9px] text-slate-700 font-mono select-none">
            <span>↑↓ history</span>
            <span>Tab complete</span>
            {lines.length > 0 && (
              <button
                onClick={() => setLines([])}
                className="hover:text-slate-500 transition-colors ml-auto"
              >
                clear output
              </button>
            )}
          </div>
        </div>

      </div>
    </Layout>
  )
}
