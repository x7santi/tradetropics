import { describe, it, expect } from 'vitest'
import { computeEntryScore } from './confidence'
import type { Candle } from './finnhub'
import type { CalendarEvent } from './confidence'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCandles(closes: number[], baseTime = 1_700_000_000): Candle[] {
  return closes.map((close, i) => ({
    time: baseTime + i * 60,
    open: close,
    high: close * 1.001,
    low:  close * 0.999,
    close,
    volume: 1_000,
  }))
}

function makeTrendingCandles(length: number, start = 100, step = 0.1): Candle[] {
  return makeCandles(Array.from({ length }, (_, i) => start + i * step))
}

function makeChoppyCandles(length: number): Candle[] {
  // Alternating closes + progressively larger recent ranges (simulates live chop + vol spike)
  return Array.from({ length }, (_, i) => {
    const close = i % 2 === 0 ? 100 : 101.5
    const pct   = i >= length - 4 ? 0.008 : 0.002   // last 4 candles have 4× wider range
    return {
      time: 1_700_000_000 + i * 60,
      open: close, high: close * (1 + pct), low: close * (1 - pct), close, volume: 1_000,
    }
  })
}

function makeEvent(
  title: string, country: string, offsetMinutes: number,
  impact: 'High' | 'Medium' | 'Low' = 'High',
  nowMs = 1_700_000_000_000
): CalendarEvent {
  return { title, country, timestamp: nowMs + offsetMinutes * 60_000, impact }
}

const NOW = 1_700_000_000_000

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('computeEntryScore', () => {
  it('returns a high-confidence long bias for a trending market with no news', () => {
    const candles = makeTrendingCandles(20)
    const result  = computeEntryScore(candles, [], 'AAPL', NOW)
    expect(result.score).toBeGreaterThanOrEqual(65)
    expect(result.label).toMatch(/long/i)
    expect(result.direction).toBe('up')
  })

  it('reduces confidence for choppy, reversal-heavy candles', () => {
    const candles = makeChoppyCandles(20)
    const result  = computeEntryScore(candles, [], 'AAPL', NOW)
    expect(result.score).toBeLessThan(50)
    expect(result.components.volatilityScore).toBeLessThan(40)
  })

  it('keeps directional bias but lowers timing confidence when high-impact news is imminent', () => {
    const candles = makeTrendingCandles(20)
    const events  = [makeEvent('CPI m/m', 'USD', 5, 'High', NOW)]
    const result  = computeEntryScore(candles, events, 'AAPL', NOW)
    expect(result.direction).toBe('up')
    expect(result.components.newsScore).toBeLessThan(100)
    expect(result.reason).toMatch(/cpi|post-news|trigger/i)
  })

  it('returns full news score when next event is 60+ min away', () => {
    const candles = makeTrendingCandles(20)
    const events  = [makeEvent('NFP', 'USD', 65, 'High', NOW)]
    const result  = computeEntryScore(candles, events, 'AAPL', NOW)
    expect(result.components.newsScore).toBe(100)
  })

  it('ignores Medium and Low impact events', () => {
    const candles = makeTrendingCandles(20)
    const events  = [
      makeEvent('Retail Sales', 'USD', 3, 'Medium', NOW),
      makeEvent('Speech', 'USD', 4, 'Low', NOW),
    ]
    const result = computeEntryScore(candles, events, 'AAPL', NOW)
    expect(result.components.newsScore).toBe(100)
  })

  it('ignores events for unrelated currencies', () => {
    const candles = makeTrendingCandles(20)
    const events  = [makeEvent('BoJ Rate', 'JPY', 3, 'High', NOW)]
    const result  = computeEntryScore(candles, events, 'EUR/USD', NOW)
    expect(result.components.newsScore).toBe(100)
  })

  it('returns neutral score when candle data is insufficient', () => {
    const result = computeEntryScore([], [], 'AAPL', NOW)
    expect(result.score).toBeGreaterThan(0)
    expect(result.score).toBeLessThanOrEqual(100)
    expect(result.components.trendScore).toBe(50)
  })

  it('score is always in the 0–100 range', () => {
    const cases = [
      computeEntryScore([], [], 'AAPL', NOW),
      computeEntryScore(makeTrendingCandles(20), [], 'EUR/USD', NOW),
      computeEntryScore(makeChoppyCandles(20), [makeEvent('CPI', 'USD', 0, 'High', NOW)], 'AAPL', NOW),
    ]
    for (const r of cases) {
      expect(r.score).toBeGreaterThanOrEqual(0)
      expect(r.score).toBeLessThanOrEqual(100)
    }
  })

  it('produces an analysis string for every case', () => {
    const cases = [
      computeEntryScore(makeTrendingCandles(20), [], 'AAPL', NOW),
      computeEntryScore(makeChoppyCandles(20),   [], 'BTC/USD', NOW),
    ]
    for (const r of cases) {
      expect(typeof r.analysis).toBe('string')
      expect(r.analysis.length).toBeGreaterThan(20)
    }
  })

  it('trending upward candles produce long direction context in analysis', () => {
    const candles = makeTrendingCandles(20, 100, 0.2)
    const result  = computeEntryScore(candles, [], 'AAPL', NOW)
    expect(result.analysis).toMatch(/long|directional|structure/i)
  })
})
