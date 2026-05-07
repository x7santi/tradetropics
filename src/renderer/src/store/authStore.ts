import { create } from 'zustand'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@renderer/lib/supabase'

export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'lifetime'
export type BillingPeriod = 'monthly' | 'yearly' | null

function normalizeSubscriptionStatus(raw: unknown): SubscriptionStatus | null {
  if (raw == null || raw === '') return 'trial'
  const s = String(raw).toLowerCase().trim()
  if (s === 'trial' || s === 'expired' || s === 'active' || s === 'lifetime') return s
  return null
}

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  subscriptionStatus: SubscriptionStatus
  billingPeriod: BillingPeriod
  avatarUrl: string | null
  /** True when a Google OAuth user has not yet set their username + password */
  needsProfileSetup: boolean
  setSession: (session: Session | null) => void
  fetchSubscription: (userId: string) => Promise<void>
  fetchAvatarUrl: (userId: string) => Promise<void>
  setAvatarUrl: (url: string | null) => void
  checkProfileSetup: (userId: string, user: User) => Promise<void>
  /** Opens Stripe checkout in the system browser. Returns an error string or null on success. */
  createCheckoutSession: (plan: 'monthly' | 'yearly' | 'lifetime') => Promise<string | null>
  /** Returns an error message on failure, or null on success */
  activatePro: (userId: string, period: 'monthly' | 'yearly') => Promise<string | null>
  activateLifetime: (userId: string) => Promise<string | null>
  signIn: (identifier: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string, username?: string) => Promise<string | null>
  signInWithGoogle: () => Promise<string | null>
  completeGoogleSetup: (username: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<string | null>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,
  subscriptionStatus: 'trial',
  billingPeriod: null,
  avatarUrl: null,
  needsProfileSetup: false,

  setSession: (session) => {
    if (!session?.user) {
      set({
        session:           null,
        user:              null,
        loading:           false,
        subscriptionStatus: 'trial',
        billingPeriod:     null,
        avatarUrl:         null,
        needsProfileSetup: false,
      })
      return
    }
    set({ session, user: session.user, loading: false })
    const store = useAuthStore.getState()
    store.fetchSubscription(session.user.id)
    store.fetchAvatarUrl(session.user.id)
    store.checkProfileSetup(session.user.id, session.user)
  },

  fetchSubscription: async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('subscription_status')
      .eq('id', userId)
      .maybeSingle()

    if (useAuthStore.getState().user?.id !== userId) return

    if (error) {
      console.warn('[Auth] fetchSubscription:', error.message)
      return
    }
    if (!data) return

    const dbStatus = normalizeSubscriptionStatus(data.subscription_status)
    if (!dbStatus) {
      console.warn('[Auth] unknown subscription_status:', data.subscription_status)
      set({ subscriptionStatus: 'trial' })
      return
    }

    // DB is source of truth on sign-in (tier guard previously let stale "expired" from a
    // past session stick if the new read was skipped or mis-ordered).
    set({ subscriptionStatus: dbStatus })
  },

  fetchAvatarUrl: async (userId) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', userId)
        .single()
      set({ avatarUrl: data?.avatar_url ?? null })
    } catch {
      // column may not exist yet — silently skip
    }
  },

  setAvatarUrl: (url) => set({ avatarUrl: url }),

  checkProfileSetup: async (userId, user) => {
    try {
      const isGoogleUser =
        user?.app_metadata?.provider === 'google' ||
        user?.identities?.some((i: any) => i.provider === 'google')
      if (!isGoogleUser) { set({ needsProfileSetup: false }); return }
      const { data } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', userId)
        .maybeSingle()
      set({ needsProfileSetup: !data?.display_name })
    } catch {
      set({ needsProfileSetup: false })
    }
  },

  signInWithGoogle: async () => {
    try {
      if (!window.auth) return 'OAuth bridge unavailable — please restart the app.'

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'tradetropics://auth/callback',
          skipBrowserRedirect: true,
        },
      })
      if (error) return error.message
      if (!data.url) return 'Google sign-in is not configured. Enable the Google provider in your Supabase project.'

      const callbackUrl = await window.auth.openGoogleOAuth(data.url)
      if (!callbackUrl) return null // user closed the popup — stay on login

      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(callbackUrl)
      if (exchangeError) return exchangeError.message

      // Await profile setup check so SetupGuard has accurate state before the caller navigates
      const { data: sessionData } = await supabase.auth.getSession()
      if (sessionData.session?.user) {
        await get().checkProfileSetup(sessionData.session.user.id, sessionData.session.user)
      }

      return null
    } catch (err: any) {
      return err?.message ?? 'Google sign-in failed'
    }
  },

  completeGoogleSetup: async (username, password) => {
    try {
      const userId = get().user?.id
      if (!userId) return 'Not signed in.'

      if (username.length < 3) return 'Username must be at least 3 characters.'
      if (!/^[a-zA-Z0-9_]+$/.test(username)) return 'Username may only contain letters, numbers, and underscores.'

      const { data: avail, error: availErr } = await supabase.rpc('check_username_available', { p_username: username })
      if (availErr) return availErr.message
      if (!avail) return 'Username already taken. Please choose another.'

      const { error: pwErr } = await supabase.auth.updateUser({ password })
      if (pwErr) return pwErr.message

      const { error: profileErr } = await supabase
        .from('profiles')
        .upsert({ id: userId, display_name: username })
      if (profileErr) return profileErr.message

      set({ needsProfileSetup: false })
      return null
    } catch (err: any) {
      return err?.message ?? 'Setup failed'
    }
  },

  createCheckoutSession: async (plan) => {
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { plan },
      })
      if (error) return error.message
      if (!data?.url) return 'No checkout URL returned — please try again.'
      window.shell?.openExternal(data.url)
      return null
    } catch (err: any) {
      return err?.message ?? 'Failed to start checkout'
    }
  },

  activatePro: async (userId, period) => {
    if (get().user?.id !== userId) return 'Not signed in.'

    const { data: rpcOk, error: rpcErr } = await supabase.rpc('set_my_subscription', {
      p_status: 'active',
    })

    if (!rpcErr && rpcOk === true) {
      set({ subscriptionStatus: 'active', billingPeriod: period })
      return null
    }

    if (rpcErr) {
      console.warn('[Auth] activatePro RPC:', rpcErr.message)
    }

    const { data: rows, error: upErr } = await supabase
      .from('profiles')
      .update({ subscription_status: 'active' })
      .eq('id', userId)
      .select('subscription_status')

    if (upErr) {
      console.warn('[Auth] activatePro update:', upErr.message)
      return rpcErr?.message ?? upErr.message
    }

    const row = Array.isArray(rows) ? rows[0] : rows
    const applied = row ? normalizeSubscriptionStatus(row.subscription_status) : null
    if (applied !== 'active') {
      return (
        'Could not activate Pro. Apply the Supabase migration `set_my_subscription` ' +
        '(see supabase/migrations/) or allow authenticated users to update their own `profiles` row.'
      )
    }

    set({ subscriptionStatus: 'active', billingPeriod: period })
    return null
  },

  activateLifetime: async (userId) => {
    if (get().user?.id !== userId) return 'Not signed in.'

    const { data: rpcOk, error: rpcErr } = await supabase.rpc('set_my_subscription', {
      p_status: 'lifetime',
    })

    if (!rpcErr && rpcOk === true) {
      set({ subscriptionStatus: 'lifetime' })
      return null
    }

    if (rpcErr) {
      console.warn('[Auth] activateLifetime RPC:', rpcErr.message)
    }

    const { data: rows, error: upErr } = await supabase
      .from('profiles')
      .update({ subscription_status: 'lifetime' })
      .eq('id', userId)
      .select('subscription_status')

    if (upErr) {
      console.warn('[Auth] activateLifetime update:', upErr.message)
      return rpcErr?.message ?? upErr.message
    }

    const row = Array.isArray(rows) ? rows[0] : rows
    const applied = row ? normalizeSubscriptionStatus(row.subscription_status) : null
    if (applied !== 'lifetime') {
      return (
        'Could not activate Lifetime. Apply the Supabase migration `set_my_subscription` ' +
        '(see supabase/migrations/) or fix RLS on `profiles`.'
      )
    }

    set({ subscriptionStatus: 'lifetime' })
    return null
  },

  signIn: async (identifier, password) => {
    try {
      let emailToUse = identifier
      if (!identifier.includes('@')) {
        const { data: resolvedEmail, error: rpcErr } = await supabase
          .rpc('get_email_by_username', { p_username: identifier })
        if (rpcErr) return rpcErr.message
        if (!resolvedEmail) return 'No account found with that username.'
        emailToUse = resolvedEmail as string
      }
      const { error } = await supabase.auth.signInWithPassword({ email: emailToUse, password })
      return error ? error.message : null
    } catch (err: any) {
      return err?.message ?? 'Sign in failed'
    }
  },

  signUp: async (email, password, username) => {
    try {
      if (!username || username.length < 3) return 'Username must be at least 3 characters.'
      if (!/^[a-zA-Z0-9_]+$/.test(username)) return 'Username can only contain letters, numbers, and underscores.'

      const { data: existing, error: lookupErr } = await supabase
        .from('profiles')
        .select('id')
        .eq('display_name', username)
        .maybeSingle()
      if (lookupErr) return lookupErr.message
      if (existing) return 'Username already taken.'

      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) return error.message

      const userId = (data as any)?.user?.id
      if (userId) {
        await supabase.from('profiles').upsert({ id: userId, display_name: username })
      } else {
        await supabase.from('profiles').upsert({ email, display_name: username })
      }

      return null
    } catch (err: any) {
      return err?.message ?? 'Sign up failed'
    }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null, subscriptionStatus: 'trial', billingPeriod: null, avatarUrl: null, needsProfileSetup: false })
  },

  resetPassword: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    return error ? error.message : null
  },
}))
