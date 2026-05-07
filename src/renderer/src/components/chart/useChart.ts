import { useEffect, useRef } from 'react'
import {
  createChart, CandlestickSeries, HistogramSeries, ColorType, CrosshairMode,
} from 'lightweight-charts'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { useSettingsStore, BG_COLORS } from '@renderer/store/settingsStore'

export function useChart(containerRef: React.RefObject<HTMLDivElement | null>) {
  const getCandleTheme = useSettingsStore(s => s.getCandleTheme)
  const chartBgMode    = useSettingsStore(s => s.chartBgMode)
  const chartRef        = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)

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

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat:  { type: 'volume' },
      priceScaleId: 'vol',
    })

    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    })

    chartRef.current        = chart
    candleSeriesRef.current = candleSeries
    volumeSeriesRef.current = volumeSeries

    return () => {
      chart.remove()
      chartRef.current        = null
      candleSeriesRef.current = null
      volumeSeriesRef.current = null
    }
  }, []) // containerRef is stable

  return { chartRef, candleSeriesRef, volumeSeriesRef }
}
