import { useEffect, useRef, useState } from 'react'
import { useChartStore } from '@renderer/store/chartStore'
import { fetchNews, type NewsItem, type Sentiment } from '@renderer/lib/news'

const REFRESH_MS = 5 * 60_000

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const m = Math.floor(diff / 60_000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function sentimentClass(s: Sentiment): string {
  if (s === 'positive') return 'text-emerald-400/80'
  if (s === 'negative') return 'text-rose-400/80'
  return 'text-slate-500'
}

function SkeletonRow({ wide }: { wide?: boolean }): JSX.Element {
  return (
    <div className="px-3 py-2.5 border-b border-glass/40 last:border-0">
      <div className={`h-3 rounded bg-white/[0.06] animate-pulse mb-1.5 ${wide ? 'w-4/5' : 'w-3/5'}`} />
      <div className="h-3 rounded bg-white/[0.06] animate-pulse w-full mb-1.5" />
      <div className="h-2 rounded bg-white/[0.04] animate-pulse w-1/3" />
    </div>
  )
}

function HeadlineRow({ item }: { item: NewsItem }): JSX.Element {
  const handleClick = () => {
    window.shell?.openExternal(item.url)
  }

  return (
    <button
      onClick={handleClick}
      className="w-full text-left px-3 py-2.5 border-b border-glass/40 last:border-0 hover:bg-white/[0.03] transition-colors group"
    >
      <p className="text-xs text-slate-300 leading-snug group-hover:text-slate-100 transition-colors line-clamp-2">
        {item.headline}
      </p>
      <p className="mt-1 text-[10px] flex items-center gap-1.5">
        <span className={`font-medium ${sentimentClass(item.sentiment)}`}>{item.source}</span>
        <span className="text-slate-700">·</span>
        <span className="text-slate-600">{relativeTime(item.timestamp)}</span>
      </p>
    </button>
  )
}

export default function NewsPanel(): JSX.Element {
  const symbol = useChartStore(s => s.symbol)

  const [items,   setItems]   = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(false)
      try {
        const data = await fetchNews(symbol)
        if (!cancelled) { setItems(data); setLoading(false) }
      } catch {
        if (!cancelled) { setError(true); setLoading(false) }
      }
    }

    load()
    const id = setInterval(load, REFRESH_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [symbol])

  return (
    <div className="px-0 pb-4">
      <div className="px-3 mb-2">
        <p className="text-xs text-slate-400 uppercase tracking-wider">News</p>
        <p className="text-[10px] text-slate-500 mt-0.5">{symbol} + market · auto-refreshes</p>
      </div>

      <div className="mx-0">
        {loading && items.length === 0 ? (
          <>
            <SkeletonRow wide />
            <SkeletonRow />
            <SkeletonRow wide />
            <SkeletonRow />
            <SkeletonRow wide />
          </>
        ) : error ? (
          <p className="px-3 text-xs text-slate-500">Headlines unavailable</p>
        ) : items.length === 0 ? (
          <p className="px-3 text-xs text-slate-500">No recent headlines for {symbol}</p>
        ) : (
          items.map(item => <HeadlineRow key={item.id} item={item} />)
        )}
      </div>
    </div>
  )
}
