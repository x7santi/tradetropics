import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from '@renderer/lib/supabase'
import { useAuthStore } from '@renderer/store/authStore'
import { useReportStore } from '@renderer/store/reportStore'
import LoginPage from '@renderer/pages/LoginPage'
import SignupPage from '@renderer/pages/SignupPage'
import ForgotPasswordPage from '@renderer/pages/ForgotPasswordPage'
import DashboardPage from '@renderer/pages/DashboardPage'
import ChartsPage from '@renderer/pages/ChartsPage'
import PaywallPage from '@renderer/pages/PaywallPage'
import AccountPage from '@renderer/pages/AccountPage'
import ReportsPage from '@renderer/pages/ReportsPage'
import SettingsPage from '@renderer/pages/SettingsPage'
import JournalPage from '@renderer/pages/JournalPage'
import CalendarPage from '@renderer/pages/CalendarPage'
import AnalysisReport from '@renderer/components/AnalysisReport'
import UpdateBanner from '@renderer/components/UpdateBanner'
import GoogleSetupPage from '@renderer/pages/GoogleSetupPage'
import DevLogPage from '@renderer/pages/DevLogPage'
import BacktestPage from '@renderer/pages/BacktestPage'

const Spinner = () => (
  <div className="flex h-screen items-center justify-center bg-slate-900">
    <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
  </div>
)

// Requires login only — used for /auth/setup itself so it doesn't loop
function ProtectedRoute({ children }: { children: JSX.Element }): JSX.Element {
  const { session, loading } = useAuthStore()
  if (loading) return <Spinner />
  return session ? children : <Navigate to="/" replace />
}

// Requires login AND completed profile setup
function SetupGuard({ children }: { children: JSX.Element }): JSX.Element {
  const { session, loading, needsProfileSetup } = useAuthStore()
  if (loading) return <Spinner />
  if (!session) return <Navigate to="/" replace />
  if (needsProfileSetup) return <Navigate to="/auth/setup" replace />
  return children
}

export default function App(): JSX.Element {
  const setSession   = useAuthStore((s) => s.setSession)
  const session      = useAuthStore((s) => s.session)
  const fetchReports = useReportStore((s) => s.fetchReports)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [setSession])

  // Load reports from Supabase whenever a user session is present
  useEffect(() => {
    if (session?.user?.id) fetchReports(session.user.id)
  }, [session?.user?.id, fetchReports])

  return (
    <HashRouter>
      <Routes>
        <Route path="/"                element={<LoginPage />} />
        <Route path="/signup"          element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/auth/setup"      element={<ProtectedRoute><GoogleSetupPage /></ProtectedRoute>} />
        <Route path="/paywall"         element={<SetupGuard><PaywallPage /></SetupGuard>} />
        <Route path="/dashboard"       element={<SetupGuard><DashboardPage /></SetupGuard>} />
        <Route path="/charts"          element={<SetupGuard><ChartsPage /></SetupGuard>} />
        <Route path="/journal"         element={<SetupGuard><JournalPage /></SetupGuard>} />
        <Route path="/calendar"        element={<SetupGuard><CalendarPage /></SetupGuard>} />
        <Route path="/settings"        element={<SetupGuard><SettingsPage /></SetupGuard>} />
        <Route path="/account"         element={<SetupGuard><AccountPage /></SetupGuard>} />
        <Route path="/reports"         element={<SetupGuard><ReportsPage /></SetupGuard>} />
        <Route path="/devlog"          element={<SetupGuard><DevLogPage /></SetupGuard>} />
        <Route path="/backtest"        element={<SetupGuard><BacktestPage /></SetupGuard>} />
        <Route path="*"                element={<Navigate to="/" replace />} />
      </Routes>
      {/* Global fixed overlay — accessible from any route */}
      {session && <AnalysisReport />}
      <UpdateBanner />
    </HashRouter>
  )
}
