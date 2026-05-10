export type Sentiment = 'positive' | 'negative' | 'neutral'

export interface NewsItem {
  id:        string
  headline:  string
  source:    string
  url:       string
  timestamp: number
  sentiment: Sentiment
}

const POSITIVE_RE = /\b(gain|gains|rise|rises|rising|rally|rallied|surges?|surge|beats?|beat|growth|bullish|record|boost|profit|advance|climbs?|jump|jumps|strong|recover|recovery)\b/i
const NEGATIVE_RE = /\b(fall|falls|drop|drops|decline|declines|loss|losses|crash|crashes|miss|missed|bearish|cut|cuts|recession|debt|weak|slump|tumble|tumbles|plunge|plunges|selloff|sell-off|warning|warns?)\b/i

function scoreSentiment(headline: string): Sentiment {
  const pos = (headline.match(POSITIVE_RE) ?? []).length
  const neg = (headline.match(NEGATIVE_RE) ?? []).length
  if (pos > neg) return 'positive'
  if (neg > pos) return 'negative'
  return 'neutral'
}

function finnhubToken(): string {
  return (import.meta.env.VITE_FINNHUB_API_KEY as string | undefined)?.trim() ?? ''
}

function fetcher(url: string): Promise<string> {
  if (window.nativeFetch?.fetch) return window.nativeFetch.fetch(url)
  return fetch(url).then(r => r.text())
}

function mapFinnhubItem(raw: Record<string, unknown>, index: number): NewsItem | null {
  const headline = String(raw.headline ?? '').trim()
  const url      = String(raw.url ?? '').trim()
  const source   = String(raw.source ?? '').trim()
  if (!headline || !url || !url.startsWith('https')) return null

  const timestamp = typeof raw.datetime === 'number'
    ? raw.datetime * 1000
    : Date.now() - index * 60_000

  return {
    id:        String(raw.id ?? `${timestamp}-${index}`),
    headline,
    source:    source || 'News',
    url,
    timestamp,
    sentiment: scoreSentiment(headline),
  }
}

/** General market news — used as the primary/fallback feed. */
async function fetchGeneralNews(token: string): Promise<NewsItem[]> {
  const url = `https://finnhub.io/api/v1/news?category=general&token=${encodeURIComponent(token)}`
  try {
    const body = await fetcher(url)
    const data: unknown = JSON.parse(body)
    if (!Array.isArray(data)) return []
    return (data as Record<string, unknown>[])
      .map((item, i) => mapFinnhubItem(item, i))
      .filter((x): x is NewsItem => x !== null)
      .slice(0, 30)
  } catch {
    return []
  }
}

/** Company-specific news for the active symbol. Falls back to empty array. */
async function fetchCompanyNews(symbol: string, token: string): Promise<NewsItem[]> {
  const now  = new Date()
  const from = new Date(now.getTime() - 7 * 86_400_000)
  const toStr   = now.toISOString().slice(0, 10)
  const fromStr = from.toISOString().slice(0, 10)

  const base = symbol.includes('/') ? symbol.split('/')[0] : symbol
  const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(base)}&from=${fromStr}&to=${toStr}&token=${encodeURIComponent(token)}`
  try {
    const body = await fetcher(url)
    const data: unknown = JSON.parse(body)
    if (!Array.isArray(data)) return []
    return (data as Record<string, unknown>[])
      .map((item, i) => mapFinnhubItem(item, i))
      .filter((x): x is NewsItem => x !== null)
      .slice(0, 15)
  } catch {
    return []
  }
}

function dedupeByUrl(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>()
  return items.filter(item => {
    if (seen.has(item.url)) return false
    seen.add(item.url)
    return true
  })
}

/**
 * Fetch news headlines for the given symbol.
 * Returns company-specific articles merged with general market news.
 * Throws if Finnhub token is missing or both fetches fail.
 */
export async function fetchNews(symbol: string): Promise<NewsItem[]> {
  const token = finnhubToken()
  if (!token) throw new Error('No Finnhub API key configured')

  const [company, general] = await Promise.all([
    fetchCompanyNews(symbol, token),
    fetchGeneralNews(token),
  ])

  // Company news first, then general fill
  const merged = dedupeByUrl([...company, ...general])
  return merged.sort((a, b) => b.timestamp - a.timestamp).slice(0, 25)
}
