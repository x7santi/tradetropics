import { useEffect, useRef } from 'react'
import {
  createChart, CandlestickSeries, HistogramSeries, LineSeries, ColorType, CrosshairMode,
} from 'lightweight-charts'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { useSettingsStore, BG_COLORS } from '@renderer/store/settingsStore'

export function makeTickMarkFormatter(tz: string | null) {
  return (time: number, tickMarkType: number): string => {
    const d    = new Date(time * 1000)
    const opts = tz ? { timeZone: tz } : {}
    if (tickMarkType === 0) return new Intl.DateTimeFormat('en', { year: 'numeric', ...opts }).format(d)
    if (tickMarkType === 1) return new Intl.DateTimeFormat('en', { month: 'short', ...opts }).format(d)
    if (tickMarkType === 2) {
      return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', ...opts }).format(d)
    }
    const parts = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', hour12: false, ...opts }).formatToParts(d)
    const h = parts.find(p => p.type === 'hour')?.value ?? '00'
    const m = parts.find(p => p.type === 'minute')?.value ?? '00'
    return `${h}:${m}`
  }
}

export function useChart(containerRef: React.RefObject<HTMLDivElement | null>) {
  const getCandleTheme = useSettingsStore(s => s.getCandleTheme)
  const chartBgMode    = useSettingsStore(s => s.chartBgMode)
  const timezone       = useSettingsStore(s => s.timezone)
  const chartRef        = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const rsiSeriesRef    = useRef<ISeriesApi<'Line'> | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const theme  = getCandleTheme()
    const bgCols = BG_COLORS[chartBgMode]
    const chart  = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: bgCols.bg },
        textColor:  bgCols.text,
      },
      grid: {
        vertLines: { color: bgCols.grid },
        horzLines: { color: bgCols.grid },
      },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: {
        borderColor:    bgCols.border,
        timeVisible:    true,
        secondsVisible: false,
        tickMarkFormatter: makeTickMarkFormatter(timezone),
      },
      rightPriceScale: { borderColor: bgCols.border },
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor:       theme.upColor,
      downColor:     theme.downColor,
      borderVisible: theme.borderVisible ?? false,
      borderUpColor:   theme.borderUpColor,
      borderDownColor: theme.borderDownColor,
      wickUpColor:   theme.wickUpColor,
      wickDownColor: theme.wickDownColor,
    })

    // Volume: thin strip at the very bottom
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat:  { type: 'volume' },
      priceScaleId: 'vol',
    })
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.90, bottom: 0 },
    })

    // RSI 14: sub-panel above volume, below main price chart
    const rsiSeries = chart.addSeries(LineSeries, {
      color:             'rgba(167,139,250,0.85)', // violet-400 at 85%
      lineWidth:         1,
      priceScaleId:      'rsi',
      priceLineVisible:  false,
      lastValueVisible:  false,
      crosshairMarkerVisible: false,
    })
    chart.priceScale('rsi').applyOptions({
      scaleMargins: { top: 0.72, bottom: 0.11 },
    })

    chartRef.current        = chart
    candleSeriesRef.current = candleSeries
    volumeSeriesRef.current = volumeSeries
    rsiSeriesRef.current    = rsiSeries

    return () => {
      chart.remove()
      chartRef.current        = null
      candleSeriesRef.current = null
      volumeSeriesRef.current = null
      rsiSeriesRef.current    = null
    }
  }, []) // containerRef is stable

  return { chartRef, candleSeriesRef, volumeSeriesRef, rsiSeriesRef }
}
