# TradeTropics — Claude Code Project Spec

> **Self-updating rule**: At the end of every prompt session, update this file with anything new learned — architecture discoveries, confirmed bugs, user preferences, design decisions, and rules. This keeps context cost low across sessions.

> **Self-analysis rule**: At the start of every session, scan the Known Issues section and consider whether previous sessions left systematic gaps (e.g., "glassmorphism fixed" but legacy tokens remain in untouched files). If a fix was scoped to one file but the same class of problem exists elsewhere, enumerate the remaining gaps before starting new work. Prefer systematic fixes over spot fixes. If the user reports something "still not fixed," look for the root cause rather than repeating a surface patch — e.g., if a component still has wrong styling, trace to the parent container before touching the component itself.

---

## Project Overview

**TradeTropics** is an Electron desktop app (Mac + Windows) providing AI-powered trade intelligence. Core features: live candlestick chart, AI entry-score confidence meter, economic calendar, trade journal, backtest engine, reports system, and market news.

**Stack**: Electron + Vite + React 18 + TypeScript + TailwindCSS v3 + Zustand + Supabase + LightweightCharts v5 + Stripe

---

## Architecture

```
src/
  main/index.ts          — Electron main process; OAuth popup; auto-updater; IPC
  preload/index.ts       — Context bridge: exposes window.electron + window.shell
  renderer/src/
    App.tsx              — Router, auth listener, global report loader
    index.css            — Global styles, glassmorphism background blobs
    components/
      Layout.tsx         — Shell: Sidebar + Topbar + main + optional right rail
      Sidebar.tsx        — Nav (Dashboard hub + Charts + others), version badge
      Topbar.tsx         — Page title, live clock (respects timezone), plan badge
      TradeJournal.tsx   — Bottom-strip panel on Charts page (fixed height h-44)
      ChartPanel.tsx     — TradingView chart + toolbar + annotation tool
      ConfidenceMeter.tsx— AI entry score widget (right rail of Charts page)
      EconomicCalendar.tsx — Macro events (right rail of Charts page)
      NewsPanel.tsx      — Market headlines (available but not shown by default)
      AnalysisReport.tsx — Full-screen slide-up report overlay (global)
    pages/
      DashboardPage.tsx  — Hub landing page (tiles, stats, recent trades, upgrade CTA)
      ChartsPage.tsx     — Chart view with AI score + calendar right rail + journal strip
      JournalPage.tsx    — Full-page trade journal
      CalendarPage.tsx   — Economic calendar full page
      ReportsPage.tsx    — AI reports list + analytics strip
      BacktestPage.tsx   — Backtest engine
      SettingsPage.tsx   — Preferences
      AccountPage.tsx    — Profile, stats, sign out
      ...auth pages
    store/               — Zustand stores (one per domain)
    lib/                 — Pure logic: confidence, candles, news, supabase, sounds
```

### Routes
| Path | Component | Notes |
|---|---|---|
| `/dashboard` | DashboardPage | **Default landing page** after login — hub with tiles, stats |
| `/charts` | ChartsPage | Live chart + AI score + calendar + journal strip |
| `/journal` | JournalPage | Pro only |
| `/calendar` | CalendarPage | Available to all |
| `/reports` | ReportsPage | Pro only |
| `/backtest` | BacktestPage | Pro only |
| `/settings` | SettingsPage | Available to all |
| `/account` | AccountPage | Available to all |
| `/paywall` | PaywallPage | Upgrade flow |

---

## Design System — Glassmorphism

**The entire app uses glassmorphism.** Every panel, card, modal, and sidebar must follow these rules.

### Background
The `body` in `index.css` has layered radial gradient blobs (indigo top-left, cyan bottom-right) over `#060d1a`. This creates the visual depth that makes `backdrop-blur` visible. **Never make the root background solid black.**

### Glass token hierarchy
| Layer | Classes |
|---|---|
| Sidebar / Topbar | `bg-surface-1/50 backdrop-blur-xl border-white/[0.06]` |
| Right rail / bottom strips | `bg-white/[0.02] backdrop-blur-xl border-white/[0.06]` |
| Page section cards | `bg-white/[0.03] backdrop-blur-sm border-white/[0.06] rounded-xl` |
| Inline cards / stat boxes | `bg-white/[0.04] backdrop-blur-sm border-white/[0.07] rounded-xl` |
| Dropdowns / popovers | `bg-surface-base/80 backdrop-blur-xl border-white/[0.08] rounded-xl` |
| Modals | `bg-surface-base/80 backdrop-blur-xl border-white/[0.09] rounded-xl` |
| Dividers | `border-white/[0.06]` |
| Input fields | `bg-white/[0.04] border-white/[0.07]` |
| Toolbar buttons (inactive) | `bg-white/[0.03] border-white/[0.06]` |

**Never use** `bg-surface-1`, `bg-surface-2`, `bg-surface-3`, or `border-glass` on new or updated components. These legacy tokens still exist in Tailwind config but should be replaced wherever touched.

### Surface colors (Tailwind config)
```
surface-base = #060d1a
surface-1    = #0b1526
surface-2    = #101e32
surface-3    = #162440
border-glass = rgba(255,255,255,0.07)
```

---

## Chart System

### Data providers (cascade order)
1. **TwelveData** — primary live feed
2. **BiQuote** — first fallback
3. **Yahoo Finance** — second fallback
4. **Cache** — last resort
5. **Synthetic** — generated fallback (shown as "Stale")

### Timeframes & poll intervals
Defined in `components/chart/types.ts` → `POLL_MS`:
```
1m=8s, 5m=15s, 15m=30s, 30m=60s, 1H=90s, 4H=180s, 1D=300s
```

### Indicators present
- **RSI 14** — violet line, sub-panel (priceScaleId: 'rsi')
- **Volume** — histogram, bottom strip (priceScaleId: 'vol')
- **EMA 20** — REMOVED in beta 1.1. Do not re-add.
- **Long/Short direction badge** — REMOVED in beta 1.1. Do not re-add.

### Timezone
`useChart.ts` exports `makeTickMarkFormatter(tz: string | null)` — uses `Intl.DateTimeFormat` with `timeZone` option. `ChartPanel.tsx` subscribes to `settingsStore.timezone` and calls `chart.applyOptions()` on change.

### Annotation / Drawing tool
- Pencil icon opens annotate dropdown in ChartPanel toolbar
- "Draw horizontal line" toggles `drawingMode`
- `chart.subscribeClick` fires `handleChartClick` which calls `candleSeriesRef.current.coordinateToPrice(y)`
- If y is in RSI/volume sub-pane, `coordinateToPrice` returns null — code tries ±8px fallback
- Annotations stored in `annotationStore` per symbol; synced to LightweightCharts price lines

---

## Stores (Zustand)

| Store | Purpose |
|---|---|
| `authStore` | Session, user, subscription status, Google OAuth, needsProfileSetup |
| `settingsStore` | Sound, candle theme, chart bg mode, timezone, TE API key, devTools flag. No Discord — removed. |
| `reportStore` | AI reports list, quota (15/12h), read state, generation progress |
| `tradesStore` | Journal trades CRUD |
| `checklistStore` | Pre-trade checklist items |
| `marketStore` | Latest candles, calendar events, refresh scheduling |
| `chartStore` | Active symbol + interval, session persistence |
| `dashboardToolStore` | Legacy toggle store — no longer used by Sidebar or ChartsPage; keep file but do not expand |
| `annotationStore` | Chart price-line annotations per symbol |
| `devLogStore` | Dev console log entries + unread count |
| `favoritesStore` | Favorited symbols |
| `calendarStore` | Calendar P&L + notes per day |

---

## AI Scoring (`lib/confidence.ts`)

### Direction logic — key-level-aware (v1.3+)
`computeEntryScore()` → `computeDirectionalSignal()` builds `signedEvidence` from layers:

1. **Net price move** (`netMoveUnits * 18`) — how far price has traveled vs ATR
2. **EMA spread** (`emaUnits * 13`) — position relative to EMA20
3. **Trend direction** (`±10`) — EMA-based macro direction; weight deliberately reduced from 18 to allow key levels to dominate
4. **Body flow** — average candle body direction over last 20 candles
5. **RSI mid-range bias** — RSI 52–72 adds bullish, 28–48 adds bearish
6. **Premium/discount zone** (`-zonePos * 28`) — **primary fix**: price near resistance (premium) adds strong bearish evidence; near support (discount) adds strong bullish evidence. This is the "uptrend ≠ always long" correction.
7. **Reversal confluence** — RSI extremes, key-level proximity, liquidity sweeps, rejection wicks, RSI divergence (price new extreme without RSI confirmation)

`EntryScoreResult` now includes `premiumDiscount: 'premium' | 'discount' | 'equilibrium' | 'unknown'` displayed as a badge in ConfidenceMeter.

### Charts page tool layout (v1.3+)
- Right rail: **always** shows ConfidenceMeter + EconomicCalendar (no sidebar toggle)
- Bottom strip: TradeJournal with its own collapse button (local `useState`, not dashboardToolStore)
- `dashboardToolStore` is no longer read by ChartsPage or Sidebar

---

## Reports System

- `REPORTS_PER_DAY = 15` (12-hour rolling window, cross-device via Supabase)
- Quota counted in `reportStore.ts` — `remainingReports()`, `usageCount`
- AI generation via Supabase Edge Function `ai-analysis`
- Reports page has: search, filter (All/Long/Short/Flat/Strong/Weak), sort (Newest/Oldest/Score), analytics strip

---

## Authentication

- Email/password via Supabase Auth
- Google OAuth via Electron popup (`tradetropics://` custom protocol)
- After `await signInWithGoogle()`, always read `useAuthStore.getState().needsProfileSetup` (not the stale closure value from component render)
- Profile setup flow: `/auth/setup` → `GoogleSetupPage`

---

## Subscription / Monetisation

- Tiers: `trial` (free), `active` (Pro monthly/yearly), `lifetime`, `expired`
- Stripe checkout via Supabase Edge Function `create-checkout-session`
- Webhook at `stripe-webhook` updates `profiles.subscription_status`
- `ProGate` / `useIsPro()` gates Pro features in sidebar and UI
- Paywall at `/paywall`

---

## Hidden Commands

The `/aisetdaypl` command is **intentionally hidden** from all UI and help text. It exists and is functional in `DevLogPage.tsx`. It must **never** appear in:
- `/help` command output in DevLogPage
- Any sidebar or UI label
- Any visible menu or tooltip

Do not remove the command implementation — only ensure it stays hidden.

---

## Glassmorphism Application Rules

1. **Every session**: When touching any component, migrate `bg-surface-*` and `border-glass` to the glass tokens above.
2. **Structural components first**: Sidebar, Topbar, Layout rail, TradeJournal are highest priority.
3. **Never use `backdrop-blur` without a semi-transparent background** — blur with a solid background is invisible.
4. **Test glassmorphism visually**: The gradient background blobs in `index.css` must be present or glass panels look flat.

---

## Rules & Preferences

### Code style
- No comments unless the WHY is non-obvious
- No multi-paragraph docstrings
- No console.log left in production code
- TypeScript strict — zero `tsc --noEmit` errors required before committing
- Tailwind utility-first — no custom CSS classes unless absolutely necessary
- Never add `flex-1` to an element inside a flex container whose parent has `height: auto` — this collapses or causes fullscreen growth. Use explicit `h-*` instead.

### UI rules
- All time displays: `hour: 'numeric'` not `'2-digit'` — avoids leading-zero hours
- Confidence meter score ring uses SVG circle, not a bar
- Chart toolbar buttons: compact, `text-[10px]`, `px-2 py-1`
- TradeJournal body height is `h-44` (fixed) — never add `flex-1` to the body
- Dashboard journal = bottom strip; Journal page (/journal) = full page

### Glassmorphism DO/DON'T
- DO: `bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-xl`
- DON'T: `bg-surface-1 border border-glass rounded-lg`
- DO: gradient background in body CSS for glass to show through
- DON'T: solid `bg-surface-base` on root layout divs

### Commit policy
- Run `npx tsc --noEmit` before every commit — must be zero errors
- Version in `package.json` must match what's shown in the sidebar (`v${__APP_VERSION__}`)
- Never commit without user confirmation when they explicitly ask to verify first
- Commit format: `feat:` / `fix:` / `chore:` followed by concise description

---

## Version History

| Version | Notes |
|---|---|
| 1.0.0 | betaDemoV1.0 |
| 1.1.0 | beta v1.1 — EMA removed, LongShort removed, poll intervals tightened, reports quota 15, calendar redesign, backtest timeframe selector |
| 1.2.0 | (pending user verification) — Google login stale state fix, Reports overhaul, timezone chart wiring, glassmorphism global remodel, journal fullscreen fix, drawing tool fix, time display fix |
| 1.3.0 | (pending user verification) — Dashboard hub page, Charts page (renamed from Dashboard), Sidebar tool-toggle removal, AI scoring overhaul (premium/discount zone fix, RSI divergence, reduced trend weight), ConfidenceMeter glass tokens + premium/discount badge, AccountPage full remodel (avatar upload, stats, Discord webhook, CSV export/import), SettingsPage glass remodel, DevLogPage advanced console (command history ↑/↓, tab autocomplete, /reset-journal command) |

---

## Known Issues / Watch List

- Drawing tool: `coordinateToPrice` returns null when clicking RSI/volume sub-panes. Fixed with ±8px fallback, but the click must land in the main price pane area for best results.
- LightweightCharts v5 `subscribeClick` uses `MouseEventParams<Time>` — the handler is cast as `any` to avoid type mismatch; this is intentional.
- `bg-surface-*` tokens remain in Tailwind config for backward compat. Replace on any file touched.
- Timezone formatter in `useChart.ts` runs once at chart creation; ChartPanel reacts to changes via `applyOptions` effect.

---

## File Quick-Reference

| File | What it controls |
|---|---|
| `src/renderer/src/index.css` | Global body background (gradient blobs) + glass utility class |
| `tailwind.config.js` | Surface colors, glass border tokens, animations |
| `store/reportStore.ts` | `REPORTS_PER_DAY = 15` |
| `components/chart/types.ts` | `POLL_MS` intervals per timeframe |
| `components/chart/useChart.ts` | Chart creation + `makeTickMarkFormatter` |
| `components/chart/useCandles.ts` | Candle fetching, cascade, live polling |
| `components/chart/ChartPanel.tsx` | Chart toolbar, annotations, status pill, feed menu |
| `components/Sidebar.tsx` | Nav (no sub-toggles — plain NavItem per route) |
| `components/Topbar.tsx` | Live clock (timezone-aware), plan badge |
| `components/Layout.tsx` | Shell layout + right rail (all glass tokens — no legacy surface tokens) |
| `components/TradeJournal.tsx` | Charts page bottom journal strip (h-44, no flex-1 on body) |
| `pages/DashboardPage.tsx` | Hub landing — profile, stats (today/week/win-rate/total), nav tiles, recent trades, upgrade CTA. Sidebar hidden (hideSidebar prop). Email NOT shown here. |
| `pages/ChartsPage.tsx` | Chart view — AI score + calendar right rail always shown, journal strip toggle |
| `pages/CalendarPage.tsx` | Calendar grid (glassmorphism cells, week filter) |
| `pages/ReportsPage.tsx` | Reports with search/filter/sort/analytics |
| `pages/SettingsPage.tsx` | Sound, candle theme, bg mode, timezone, TE key, devTools — all glass tokens, max-w-2xl card layout |
| `pages/BacktestPage.tsx` | Backtest with timeframe selector (1m→1D) |
| `pages/AccountPage.tsx` | Profile (avatar upload, email privacy toggle), stats, CSV export/import, sign out |
| `pages/DevLogPage.tsx` | Dev console — command history ↑/↓, tab autocomplete, `/reset-journal` public, `/aisetdaypl` hidden |
| `supabase/functions/ai-analysis/` | Edge function for AI deep analysis |
| `supabase/functions/create-checkout-session/` | Stripe checkout |
| `supabase/functions/stripe-webhook/` | Stripe subscription sync |
