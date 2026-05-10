import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// billingPeriod: undefined = don't touch the column; null = clear it; 'monthly'/'yearly' = set it.
// periodEnd:    same semantics.
async function setStatus(
  uid: string,
  status: string,
  subscriptionId?: string,
  billingPeriod?: 'monthly' | 'yearly' | null,
  periodEnd?: Date | null
) {
  await supabase
    .from('profiles')
    .update({
      subscription_status: status,
      ...(subscriptionId ? { stripe_subscription_id: subscriptionId } : {}),
      ...(billingPeriod !== undefined ? { billing_period: billingPeriod } : {}),
      ...(periodEnd !== undefined
        ? { subscription_period_end: periodEnd ? periodEnd.toISOString() : null }
        : {}),
    })
    .eq('id', uid)
}

async function writeAudit(uid: string, newStatus: string, eventId: string, prevStatus?: string) {
  await supabase.from('billing_audit_log').insert({
    user_id:         uid,
    previous_status: prevStatus ?? null,
    new_status:      newStatus,
    triggered_by:    eventId,
  })
}

async function findUidBySubscription(subscriptionId: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle()
  return data?.id ?? null
}

// Prefer plan metadata set at checkout; fall back to the actual Stripe recurring interval.
// This handles Stripe Dashboard upgrades/downgrades where metadata may not be re-stamped.
function deriveBillingPeriod(sub: Stripe.Subscription): 'monthly' | 'yearly' | null {
  const plan = (sub.metadata as Record<string, string>)?.plan
  if (plan === 'yearly')  return 'yearly'
  if (plan === 'monthly') return 'monthly'
  const interval = sub.items?.data?.[0]?.price?.recurring?.interval
  if (interval === 'year')  return 'yearly'
  if (interval === 'month') return 'monthly'
  return null
}

Deno.serve(async (req) => {
  const body = await req.text()
  const sig  = req.headers.get('stripe-signature')

  if (!sig) return new Response('Missing stripe-signature', { status: 400 })

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!
    )
  } catch (err: any) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  // IDEMPOTENCY: Stripe retries on 5xx — skip events already recorded in the audit log.
  const { data: alreadyProcessed } = await supabase
    .from('billing_audit_log')
    .select('id')
    .eq('triggered_by', event.id)
    .maybeSingle()

  if (alreadyProcessed) {
    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const uid  = session.metadata?.supabase_uid
      const plan = session.metadata?.plan
      if (!uid || !plan) break

      const status: string = plan === 'lifetime' ? 'lifetime' : 'active'
      const billingPeriod: 'monthly' | 'yearly' | null =
        plan === 'yearly' ? 'yearly' : plan === 'monthly' ? 'monthly' : null
      const subId = typeof session.subscription === 'string' ? session.subscription : undefined

      let periodEnd: Date | undefined
      if (subId) {
        try {
          const sub = await stripe.subscriptions.retrieve(subId)
          periodEnd = new Date(sub.current_period_end * 1000)
        } catch { /* non-fatal — period_end will be set on the next invoice event */ }
      }

      await setStatus(uid, status, subId, billingPeriod, periodEnd)
      await writeAudit(uid, status, event.id)

      // Resolve the pending billing_claim so the /success page polling hook can confirm.
      await supabase
        .from('billing_claims')
        .update({ status: 'confirmed' })
        .eq('user_id', uid)
        .eq('status', 'pending')

      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const uid = sub.metadata?.supabase_uid ?? await findUidBySubscription(sub.id)
      if (!uid) break

      if (sub.status === 'active') {
        const billingPeriod = deriveBillingPeriod(sub)
        const periodEnd     = new Date(sub.current_period_end * 1000)
        await setStatus(uid, 'active', sub.id, billingPeriod, periodEnd)
        await writeAudit(uid, 'active', event.id)
      } else if (sub.status === 'past_due' || sub.status === 'unpaid') {
        await setStatus(uid, 'expired', sub.id, null, null)
        await writeAudit(uid, 'expired', event.id)
      }
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const uid = sub.metadata?.supabase_uid ?? await findUidBySubscription(sub.id)
      if (!uid) break
      await setStatus(uid, 'expired', undefined, null, null)
      await writeAudit(uid, 'expired', event.id)
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : null
      if (!customerId) break

      // Delegate to the atomic Postgres function — the lifetime guard lives in the DB.
      // This prevents a failed recurring invoice from ever downgrading a lifetime user.
      const { error } = await supabase.rpc('handle_payment_failed', {
        p_stripe_customer_id: customerId,
        p_stripe_event_id:    event.id,
      })
      if (error) return new Response('DB error', { status: 500 })
      // Audit entry is written inside handle_payment_failed; no duplicate write here.
      break
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice
      const subId   = typeof invoice.subscription === 'string' ? invoice.subscription : null
      if (!subId) break
      const uid = await findUidBySubscription(subId)
      if (!uid) break

      const lineEnd   = (invoice as any).lines?.data?.[0]?.period?.end as number | undefined
      const periodEnd = lineEnd ? new Date(lineEnd * 1000) : undefined

      // billingPeriod undefined — never overwrite on renewal, only on plan change.
      await setStatus(uid, 'active', subId, undefined, periodEnd)
      await writeAudit(uid, 'active', event.id)
      break
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
