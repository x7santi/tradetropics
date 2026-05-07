import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Star } from 'lucide-react'
import { useChartStore } from '@renderer/store/chartStore'
import { useAuthStore }  from '@renderer/store/authStore'
import { useIsPro }      from '@renderer/components/ProGate'
import { useFavoritesStore } from '@renderer/store/favoritesStore'
import { getSymbols, searchSymbols, TYPE_ORDER, TYPE_ORDER_FREE, FALLBACK } from './symbols'
import type { SymbolItem } from './types'

const TYPE_BADGE: Record<string, string> = {
  FX:      'text-blue-400 bg-blue-500/10 border-blue-500/20',
  CRYPTO:  'text-orange-400 bg-orange-500/10 border-orange-500/20',
  FUTURES: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  STOCK:   'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
}

const PRO_TYPES = new Set<SymbolItem['type']>(['FX', 'CRYPTO', 'FUTURES'])

export default function SymbolSearch(): JSX.Element {
  const symbol    = useChartStore(s => s.symbol)
  const setSymbol = useChartStore(s => s.setSymbol)
  const userId    = useAuthStore(s => s.user?.id)
  const isPro     = useIsPro()
  const { favorites, toggle: toggleFav, isFavorite } = useFavoritesStore()

  const [input,         setInput]         = useState(symbol)
  const [open,          setOpen]          = useState(false)
  const [results,       setResults]       = useState<SymbolItem[]>([])
  const [all,           setAll]           = useState<SymbolItem[]>(FALLBACK)
  const [flashedSymbol, setFlashedSymbol] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef    = useRef<HTMLInputElement>(null)

  useEffect(() => { getSymbols().then(setAll) }, [])
  useEffect(() => { setInput(symbol) }, [symbol])

  const doSearch = useCallback((q: string) => {
    setResults(searchSymbols(all, q))
  }, [all])

  useEffect(() => { if (open) doSearch('') }, [all]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (q: string) => {
    setInput(q)
    setOpen(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(q), 150)
  }

  const apply = (sym: string, type: SymbolItem['type']) => {
    const trimmed = sym.trim().toUpperCase()
    if (!trimmed) return
    if (!isPro && PRO_TYPES.has(type)) {
      setFlashedSymbol(trimmed)
      if (flashRef.current) clearTimeout(flashRef.current)
      flashRef.current = setTimeout(() => setFlashedSymbol(null), 500)
      return
    }
    setSymbol(trimmed, userId)
    setInput(trimmed)
    setOpen(false)
    setResults([])
  }

  const order = isPro ? TYPE_ORDER : TYPE_ORDER_FREE

  // Starred symbols that appear in current results
  const starredResults = results.filter(r => isFavorite(r.symbol))

  // Regular grouped results (exclude starred to avoid duplication)
  const grouped = order.reduce<{ type: SymbolItem['type']; items: SymbolItem[] }[]>((acc, type) => {
    const items = results.filter(r => r.type === type && !isFavorite(r.symbol))
    if (items.length > 0) acc.push({ type, items })
    return acc
  }, [])

  const hasResults = starredResults.length > 0 || grouped.length > 0

  const SymbolRow = ({ s, locked }: { s: SymbolItem; locked: boolean }) => {
    const isFlashing = flashedSymbol === s.symbol
    const starred    = isFavorite(s.symbol)
    return (
      <div className="relative group/row">
        <button
          onMouseDown={() => apply(s.symbol, s.type)}
          className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors duration-75 pr-8 ${
            isFlashing
              ? 'bg-red-500/20 text-red-400'
              : s.symbol === symbol
              ? 'bg-blue-500/10 text-blue-400'
              : locked
              ? 'text-slate-500 hover:bg-white/[0.02]'
              : 'text-slate-300 hover:bg-white/[0.04]'
          }`}
        >
          <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border ${TYPE_BADGE[s.type] ?? ''}`}>
            {s.type}
          </span>
          <span className="text-xs font-medium truncate">{s.symbol}</span>
          <span className="text-[10px] text-slate-400 truncate flex-1">{s.name}</span>
          {locked && !isFlashing && (
            <svg width="10" height="10" viewBox="0 0 14 14" fill="none" className="shrink-0 text-yellow-500/60">
              <rect x="2" y="6" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M4.5 6V4.5a2.5 2.5 0 0 1 5 0V6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          )}
        </button>
        {/* Star toggle — always visible for starred, hover-only otherwise */}
        <button
          onMouseDown={e => { e.stopPropagation(); e.preventDefault(); toggleFav(userId, s.symbol) }}
          className={`absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded transition-opacity ${
            starred
              ? 'opacity-100 text-yellow-400'
              : 'opacity-0 group-hover/row:opacity-100 text-slate-600 hover:text-yellow-400'
          }`}
        >
          <Star size={11} fill={starred ? 'currentColor' : 'none'} />
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 bg-surface-2 border border-glass rounded-lg px-3 py-1.5 transition-colors focus-within:border-blue-500/40">
        <Search size={12} className="text-slate-400 shrink-0" />
        <input
          ref={inputRef}
          value={input}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => {
            setOpen(true)
            doSearch('')          // always show full list on focus
            inputRef.current?.select()
          }}
          onBlur={() => setTimeout(() => { setOpen(false); setInput(symbol) }, 150)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const first = [...starredResults, ...grouped.flatMap(g => g.items)]
                .find(r => isPro || !PRO_TYPES.has(r.type))
              if (first) apply(first.symbol, first.type)
            }
            if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur() }
          }}
          placeholder="Symbol…"
          className="bg-transparent text-slate-100 text-xs w-24 focus:w-40 transition-all duration-150 focus:outline-none placeholder:text-slate-400"
        />
      </div>

      {open && hasResults && (
        <div className="absolute top-full mt-1 left-0 bg-surface-2 border border-glass rounded-xl shadow-glass z-50 py-1 w-72 max-h-80 overflow-y-auto animate-fade-in">

          {/* Starred section */}
          {starredResults.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
                <Star size={8} className="text-yellow-400 fill-yellow-400" />
                <span className="text-[9px] text-yellow-400/80 uppercase tracking-widest">Starred</span>
              </div>
              {starredResults.map(s => (
                <SymbolRow key={s.symbol} s={s} locked={!isPro && PRO_TYPES.has(s.type)} />
              ))}
            </div>
          )}

          {/* Type groups */}
          {grouped.map(group => {
            const locked = !isPro && PRO_TYPES.has(group.type)
            return (
              <div key={group.type}>
                <div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
                  <span className="text-[9px] text-slate-400 uppercase tracking-widest">{group.type}</span>
                  {locked && (
                    <span className="text-[9px] text-yellow-500/80 bg-yellow-500/10 border border-yellow-500/20 px-1 py-px rounded font-semibold">Pro</span>
                  )}
                </div>
                {group.items.map(s => (
                  <SymbolRow key={s.symbol} s={s} locked={locked} />
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
