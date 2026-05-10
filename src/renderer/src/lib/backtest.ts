import type { Candle } from '@renderer/lib/finnhub'
import { computeEMASeries, computeRSISeries } from '@renderer/lib/confidence'

export interface BacktestTrade {
  entryBar:   number
  exitBar:    number
  entryPrice: number
  exitPrice:  number
  pnlPct:     number
}

export interface BacktestResult {
  strategyLabel: string
  trades:        BacktestTrade[]
  totalReturn:   number   // percent
  winRate:       number   // percent
  maxDrawdown:   number   // percent (positive = bad)
  equityCurve:   { bar: number; equity: number }[]
}

// ── Max drawdown helper ───────────────────────────────────────────────────────

function maxDrawdown(curve: number[]): number {
  let peak = curve[0] ?? 1
  let dd = 0
  for (const v of curve) {
    if (v > peak) peak = v
    const cur = (peak - v) / peak * 100
    if (cur > dd) dd = cur
  }
  return dd
}

// ── EMA Crossover ─────────────────────────────────────────────────────────────
// Long-only: buy when fast EMA crosses above slow EMA, close when it crosses back.

export function backtestEMACross(
  candles: Candle[],
  fastPeriod = 9,
  slowPeriod = 21,
): BacktestResult {
  const fast = computeEMASeries(candles, fastPeriod)
  const slow = computeEMASeries(candles, slowPeriod)

  const trades: BacktestTrade[] = []
  let pos: { bar: number; price: number } | null = null
  let equity = 1
  const rawCurve: number[] = []

  for (let i = 1; i < candles.length; i++) {
    const fp = fast[i - 1], fc = fast[i]
    const sp = slow[i - 1], sc = slow[i]
    if (fp === null || fc === null || sp === null || sc === null) {
      rawCurve.push(equity); continue
    }

    const crossUp   = fp <= sp && fc > sc
    const crossDown = fp >= sp && fc < sc

    if (crossUp && !pos) {
      pos = { bar: i, price: candles[i].close }
    } else if (crossDown && pos) {
      const pnlPct = (candles[i].close - pos.price) / pos.price * 100
      equity *= 1 + pnlPct / 100
      trades.push({ entryBar: pos.bar, exitBar: i, entryPrice: pos.price, exitPrice: candles[i].close, pnlPct })
      pos = null
    }
    rawCurve.push(equity)
  }

  // Close open position at last bar
  if (pos) {
    const last = candles[candles.length - 1]
    const pnlPct = (last.close - pos.price) / pos.price * 100
    equity *= 1 + pnlPct / 100
    trades.push({ entryBar: pos.bar, exitBar: candles.length - 1, entryPrice: pos.price, exitPrice: last.close, pnlPct })
    rawCurve.push(equity)
  }

  const wins = trades.filter(t => t.pnlPct > 0)
  return {
    strategyLabel: `EMA ${fastPeriod} / ${slowPeriod} Crossover`,
    trades,
    totalReturn: (equity - 1) * 100,
    winRate:     trades.length ? (wins.length / trades.length) * 100 : 0,
    maxDrawdown: maxDrawdown(rawCurve),
    equityCurve: rawCurve.map((equity, bar) => ({ bar, equity: +((equity - 1) * 100).toFixed(2) })),
  }
}

// ── RSI Mean Reversion ────────────────────────────────────────────────────────
// Long-only: buy when RSI crosses up through oversold; sell when it crosses down through overbought.

export function backtestRSI(
  candles:    Candle[],
  period    = 14,
  oversold  = 30,
  overbought = 70,
): BacktestResult {
  const rsi = computeRSISeries(candles, period)

  const trades: BacktestTrade[] = []
  let pos: { bar: number; price: number } | null = null
  let equity = 1
  const rawCurve: number[] = []

  for (let i = 1; i < candles.length; i++) {
    const rp = rsi[i - 1], rc = rsi[i]
    if (rp === null || rc === null) { rawCurve.push(equity); continue }

    const crossedOutOversold   = rp < oversold  && rc >= oversold
    const crossedIntoOverbought = rp < overbought && rc >= overbought

    if (crossedOutOversold && !pos) {
      pos = { bar: i, price: candles[i].close }
    } else if (crossedIntoOverbought && pos) {
      const pnlPct = (candles[i].close - pos.price) / pos.price * 100
      equity *= 1 + pnlPct / 100
      trades.push({ entryBar: pos.bar, exitBar: i, entryPrice: pos.price, exitPrice: candles[i].close, pnlPct })
      pos = null
    }
    rawCurve.push(equity)
  }

  if (pos) {
    const last = candles[candles.length - 1]
    const pnlPct = (last.close - pos.price) / pos.price * 100
    equity *= 1 + pnlPct / 100
    trades.push({ entryBar: pos.bar, exitBar: candles.length - 1, entryPrice: pos.price, exitPrice: last.close, pnlPct })
    rawCurve.push(equity)
  }

  const wins = trades.filter(t => t.pnlPct > 0)
  return {
    strategyLabel: `RSI ${period}  ·  oversold ${oversold} / overbought ${overbought}`,
    trades,
    totalReturn: (equity - 1) * 100,
    winRate:     trades.length ? (wins.length / trades.length) * 100 : 0,
    maxDrawdown: maxDrawdown(rawCurve),
    equityCurve: rawCurve.map((equity, bar) => ({ bar, equity: +((equity - 1) * 100).toFixed(2) })),
  }
}
