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

async function setStatus(uid: string, status: string, subscriptionId?: string) {
  await supabase
    .from('profiles')
    .update({
      subscription_status: status,
      ...(subscriptionId ? { stripe_subscription_id: subscriptionId } : {}),
    })
    .eq('id', uid)
}

async function findUidBySubscription(subscriptionId: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle()
  return data?.id ?? null
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

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const uid  = session.metadata?.supabase_uid
      const plan = session.metadata?.plan
      if (!uid || !plan) break

      const status = plan === 'lifetime' ? 'lifetime' : 'active'
      const subId  = typeof session.subscription === 'string' ? session.subscription : undefined
      await setStatus(uid, status, subId)
      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const uid = sub.metadata?.supabase_uid ?? await findUidBySubscription(sub.id)
      if (!uid) break

      if (sub.status === 'active') await setStatus(uid, 'active', sub.id)
      else if (sub.status === 'past_due' || sub.status === 'unpaid') await setStatus(uid, 'expired')
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const uid = sub.metadata?.supabase_uid ?? await findUidBySubscription(sub.id)
      if (uid) await setStatus(uid, 'expired')
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const subId   = typeof invoice.subscription === 'string' ? invoice.subscription : null
      if (!subId) break
      const uid = await findUidBySubscription(subId)
      if (uid) await setStatus(uid, 'expired')
      break
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice
      const subId   = typeof invoice.subscription === 'string' ? invoice.subscription : null
      if (!subId) break
      const uid = await findUidBySubscription(subId)
      if (uid) await setStatus(uid, 'active')
      break
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
