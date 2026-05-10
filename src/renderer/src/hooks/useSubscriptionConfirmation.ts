import { useEffect, useState } from 'react'
import { supabase } from '@renderer/lib/supabase'

export type ConfirmationStatus = 'idle' | 'pending' | 'confirmed' | 'timeout'

const MAX_ATTEMPTS = 12 // 12 × 5s = 60-second window

/**
 * Polls billing_claims for a confirmed payment, then falls back to profiles directly.
 * Pass active=false (or no userId) to keep the hook idle.
 */
export function useSubscriptionConfirmation(
  userId: string | null | undefined,
  active: boolean
): ConfirmationStatus {
  const [status, setStatus] = useState<ConfirmationStatus>('idle')

  useEffect(() => {
    if (!active || !userId) {
      setStatus('idle')
      return
    }

    setStatus('pending')
    let attempts = 0

    const poll = setInterval(async () => {
      attempts++

      // Primary: billing_claim confirmed by the webhook
      const { data: claim } = await supabase
        .from('billing_claims')
        .select('status')
        .eq('user_id', userId)
        .eq('status', 'confirmed')
        .maybeSingle()

      if (claim) {
        setStatus('confirmed')
        clearInterval(poll)
        return
      }

      // Fallback: profile status updated directly (covers edge cases where
      // claim resolution is missed but profile was still updated)
      const { data: profile } = await supabase
        .from('profiles')
        .select('subscription_status')
        .eq('id', userId)
        .maybeSingle()

      if (
        profile?.subscription_status === 'active' ||
        profile?.subscription_status === 'lifetime'
      ) {
        setStatus('confirmed')
        clearInterval(poll)
        return
      }

      if (attempts >= MAX_ATTEMPTS) {
        setStatus('timeout')
        clearInterval(poll)
      }
    }, 5000)

    return () => clearInterval(poll)
  }, [userId, active])

  return status
}
