import { type ReactNode } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

interface LayoutProps {
  children:       ReactNode
  rightRail?:     ReactNode
  railOpen?:      boolean
  onRailToggle?:  () => void
}

export default function Layout({ children, rightRail, railOpen = true, onRailToggle }: LayoutProps): JSX.Element {
  const hasRail = !!rightRail && !!onRailToggle

  return (
    <div className="flex h-screen bg-surface-base overflow-hidden">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0">
        <Topbar />

        <div className="flex flex-1 min-h-0">
          <main className="flex flex-col flex-1 min-w-0 overflow-hidden">
            {children}
          </main>

          {/* Right rail — full panel or narrow toggle strip */}
          {hasRail && (
            railOpen ? (
              <aside className="w-72 shrink-0 border-l border-glass bg-surface-1 flex flex-col overflow-y-auto">
                {/* Collapse button pinned to top */}
                <div className="flex justify-end px-2 pt-2 shrink-0">
                  <button
                    onClick={onRailToggle}
                    title="Collapse panel"
                    className="w-6 h-6 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
                {rightRail}
              </aside>
            ) : (
              <div className="w-8 shrink-0 border-l border-glass bg-surface-1 flex flex-col items-center pt-3">
                <button
                  onClick={onRailToggle}
                  title="Expand panel"
                  className="w-6 h-6 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {/* Rotated label */}
                <p
                  className="text-[9px] text-slate-600 uppercase tracking-widest mt-3 select-none"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                >
                  AI Score
                </p>
              </div>
            )
          )}

          {/* Rail without toggle — original behaviour */}
          {rightRail && !onRailToggle && (
            <aside className="w-72 shrink-0 border-l border-glass bg-surface-1 flex flex-col overflow-y-auto">
              {rightRail}
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}
