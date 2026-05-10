import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

function loadGeminiKeys(): string[] {
  const keys: string[] = []
  const base = Deno.env.get('GEMINI_API_KEY')
  if (base) keys.push(base)
  for (let i = 2; i <= 10; i++) {
    const k = Deno.env.get(`GEMINI_API_KEY_${i}`)
    if (k) keys.push(k)
  }
  return keys
}

const GEMINI_KEYS = loadGeminiKeys()
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

interface Candle { o: string; h: string; l: string; c: string }
interface Event  { title: string; country: string; impact: string; minutesAway: number }

interface AnalysisPayload {
  symbol:          string
  interval:        string
  direction:       'up' | 'down' | 'flat'
  score:           number
  rsi:             number | null
  ema20:           number | null
  currentPrice:    number | null
  support:         number | null
  resistance:      number | null
  atr:             number | null
  trendScore:      number
  volatilityScore: number
  upcomingEvents:  Event[]
  recentEvents:    Event[]
  candles:         Candle[]
}

function fmt(n: number | null): string {
  if (n === null) return 'N/A'
  return n >= 1000 ? n.toFixed(2) : n < 10 ? n.toFixed(5) : n.toFixed(4)
}

function buildPrompt(p: AnalysisPayload): string {
  const candleText = p.candles
    .map((c, i) => `${i + 1}. O:${c.o} H:${c.h} L:${c.l} C:${c.c}`)
    .join('\n')

  const upcoming = p.upcomingEvents.length > 0
    ? p.upcomingEvents.map(e => `${e.title} (${e.country}, ${e.impact}, in ${e.minutesAway}m)`).join(' | ')
    : 'None'

  const recent = p.recentEvents.length > 0
    ? p.recentEvents.map(e => `${e.title} (${e.country}, ${e.impact}, ${Math.abs(e.minutesAway)}m ago)`).join(' | ')
    : 'None'

  const atrPips = p.atr !== null && p.currentPrice !== null && p.currentPrice < 100
    ? `${(p.atr * 10000).toFixed(1)} pips`
    : p.atr !== null ? `$${p.atr.toFixed(2)}` : 'N/A'

  const biasWord = p.direction === 'up' ? 'bullish (long)' : p.direction === 'down' ? 'bearish (short)' : 'neutral'

  return `You are a professional trader writing a trade brief. Your reader is intelligent but new to trading — write in plain English, interpret what the data means, and give a clear opinion. Do not just restate numbers. No bullet points. No jargon acronyms.

INSTRUMENT: ${p.symbol} | TIMEFRAME: ${p.interval}
BIAS: ${biasWord.toUpperCase()} | CONFIDENCE SCORE: ${p.score}/100
PRICE: ${fmt(p.currentPrice)} | EMA 20: ${fmt(p.ema20)} | RSI: ${p.rsi ?? 'N/A'}
SUPPORT: ${fmt(p.support)} | RESISTANCE: ${fmt(p.resistance)} | AVG MOVE: ${atrPips}
TREND STRENGTH: ${p.trendScore}/100 | VOLATILITY: ${p.volatilityScore}/100

RECENT CANDLES (oldest → newest):
${candleText}

UPCOMING NEWS: ${upcoming}
RECENT NEWS: ${recent}

Write exactly 6 sections using this format — each title followed by :: then 2-3 flowing sentences on one line:

What's Happening:: Describe what this market is doing right now in plain terms. Is it trending, stalling, or reversing? What story are the recent candles telling — look for exhaustion, rejection, or continuation patterns.
Why This Trade:: Explain the case for the ${biasWord} bias. Consider BOTH continuation AND reversal possibilities based on where price is relative to key levels, what RSI signals, and whether any liquidity sweeps or rejection wicks are present. Be honest if the evidence for reversal is stronger than continuation.
Levels That Matter:: Name the most important price levels and explain in plain English what happens if price reaches each one. Focus on the levels most likely to cause a reaction.
What Could Go Wrong:: Describe the main risk to this trade. Where does the setup break down? What would signal that the opposite side has taken control?
The Bottom Line:: Your honest read on whether this is a good trade right now. Factor in reversal risk. Is the ${biasWord} bias still valid, or are there enough reversal confluences to reconsider?
Trade Setup:: ${p.score >= 45
  ? `Give a specific entry zone, stop loss price, and target price using the support (${fmt(p.support)}), resistance (${fmt(p.resistance)}), and ATR (${p.atr !== null && p.currentPrice !== null && p.currentPrice < 100 ? (p.atr * 10000).toFixed(1) + ' pips' : p.atr !== null ? '$' + p.atr.toFixed(2) : 'N/A'}) provided. The target MUST be at least 2.5× the stop distance from entry — never recommend a trade with less than 2.5:1 risk:reward. State the exact prices and the final R:R ratio.`
  : `The confidence score is ${p.score}/100 — too low to recommend a reliable entry. Explain in plain terms what needs to change (e.g. a clean level hold, a liquidity sweep, a structure break) before this becomes worth trading.`}`
}

// ── Parser: 4-strategy cascade, never returns empty ──────────────────────────

const SECTION_TITLES = [
  "What's Happening",
  'Why This Trade',
  'Levels That Matter',
  'What Could Go Wrong',
  'The Bottom Line',
  'Trade Setup',
]

function parseSections(raw: string): string[] {
  if (!raw?.trim()) return []

  // Normalise: strip markdown bold/italic/code, collapse excess blank lines
  const text = raw
    .replace(/\r\n/g, '\n')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // Strategy 1: strict Title:: Body (matches the prompt's requested format)
  const strict: string[] = []
  for (const title of SECTION_TITLES) {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const others  = SECTION_TITLES.filter(t => t !== title).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const re      = new RegExp(`${escaped}\\s*::(.+?)(?=(?:${others.join('|')})\\s*::|\n\n|$)`, 's')
    const match   = text.match(re)
    if (match) {
      const body = match[1].trim().replace(/\n+/g, ' ')
      strict.push(`${title}::${body}`)
    }
  }
  if (strict.length >= 3) return strict

  // Strategy 2: Markdown headers (## Title\n Body)
  const headerPattern = /^#{1,3}\s+(.+?)\n([\s\S]+?)(?=^#{1,3}\s|\s*$)/gm
  const headerMatches = [...text.matchAll(headerPattern)]
  if (headerMatches.length >= 3) {
    return headerMatches.map(m => `${m[1].trim()}::${m[2].trim().replace(/\n+/g, ' ')}`)
  }

  // Strategy 3: Capitalised colon headers (Title:\n Body)
  const colonPattern = /^([A-Z][^\n]{2,60}):\n([\s\S]+?)(?=^[A-Z][^\n]{2,60}:|\s*$)/gm
  const colonMatches = [...text.matchAll(colonPattern)]
  if (colonMatches.length >= 3) {
    return colonMatches.map(m => `${m[1].trim()}::${m[2].trim().replace(/\n+/g, ' ')}`)
  }

  // Strategy 4: Fallback — return raw text as a single section. Never return empty.
  console.warn('[PARSER] No structure detected — using raw fallback')
  return [`Analysis::${text.replace(/\n+/g, ' ')}`]
}

// ── Request handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401 })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return new Response('Unauthorized', { status: 401 })

  if (GEMINI_KEYS.length === 0) {
    return new Response(
      JSON.stringify({ error: 'No Gemini API keys configured' }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const payload: AnalysisPayload = await req.json()
  const body = JSON.stringify({
    contents: [{ parts: [{ text: buildPrompt(payload) }] }],
    generationConfig: { maxOutputTokens: 1400, temperature: 0.4, thinkingConfig: { thinkingBudget: 0 } },
  })

  let lastStatus = 500
  let lastErr    = 'All Gemini API keys exhausted'
  let raw        = ''

  for (const key of GEMINI_KEYS) {
    const res = await fetch(`${GEMINI_BASE}?key=${key}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    if (res.ok) {
      const data      = await res.json()
      const candidate = data?.candidates?.[0]

      // SAFETY FILTER GUARD: a 200 response can still be a blocked output
      if (candidate?.finishReason === 'SAFETY') {
        return new Response(
          JSON.stringify({ error: 'SAFETY_BLOCKED' }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      raw = candidate?.content?.parts?.[0]?.text ?? ''

      // EMPTY RESPONSE GUARD: treat as a transient failure, try next key
      if (!raw.trim()) {
        lastErr = 'Empty response from Gemini'
        continue
      }

      break
    }

    lastStatus = res.status
    lastErr    = await res.text()
    if (res.status !== 429) break // non-rate-limit errors won't be fixed by rotating
  }

  if (!raw.trim()) {
    return new Response(
      JSON.stringify({ error: lastErr }),
      { status: lastStatus, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const sections = parseSections(raw)

  return new Response(
    JSON.stringify({ sections }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
