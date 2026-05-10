import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

// Service-role client for billing_claims writes — bypasses RLS intentionally.
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401 })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return new Response('Unauthorized', { status: 401 })

  const { plan } = await req.json() as { plan: 'monthly' | 'yearly' | 'lifetime' }

  // Validate plan server-side — client never controls which price is charged.
  if (plan !== 'monthly' && plan !== 'yearly' && plan !== 'lifetime') {
    return new Response(
      JSON.stringify({ error: 'Invalid plan' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Get or create Stripe customer — also read billing_period to resolve lifetime price server-side
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id, subscription_status, billing_period')
    .eq('id', user.id)
    .maybeSingle()

  let customerId = profile?.stripe_customer_id as string | undefined
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email!,
      metadata: { supabase_uid: user.id },
    })
    customerId = customer.id
    await supabaseAdmin
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id)
  }

  // Annual Pro holders get the discounted lifetime upgrade price.
  const isAnnualPro =
    profile?.subscription_status === 'active' && profile?.billing_period === 'yearly'

  const priceId = plan === 'lifetime'
    ? (isAnnualPro
        ? Deno.env.get('STRIPE_PRICE_LIFETIME_UPGRADE')!
        : Deno.env.get('STRIPE_PRICE_LIFETIME')!)
    : plan === 'monthly'
      ? Deno.env.get('STRIPE_PRICE_MONTHLY')!
      : Deno.env.get('STRIPE_PRICE_YEARLY')!

  if (!priceId) {
    return new Response(
      JSON.stringify({ error: `Price ID not configured for plan: ${plan}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    mode: plan === 'lifetime' ? 'payment' : 'subscription',
    success_url: 'https://tradetropics.app/checkout/success',
    cancel_url:  'https://tradetropics.app/checkout/cancelled',
    metadata: { supabase_uid: user.id, plan },
    ...(plan !== 'lifetime' && {
      subscription_data: { metadata: { supabase_uid: user.id, plan } }
    }),
  })

  // RACE-CONDITION FIX: stamp a pending claim now, while the user is on the Stripe
  // checkout page. The /success page polls this table while waiting for the webhook.
  // 30-minute window covers any reasonable checkout + webhook delivery delay.
  await supabaseAdmin.from('billing_claims').insert({
    user_id:      user.id,
    expected_plan: plan,
    status:       'pending',
    expires_at:   new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  })

  return new Response(
    JSON.stringify({ url: session.url }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
