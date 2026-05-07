import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

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

  const priceId = {
    monthly:  Deno.env.get('STRIPE_PRICE_MONTHLY')!,
    yearly:   Deno.env.get('STRIPE_PRICE_YEARLY')!,
    lifetime: Deno.env.get('STRIPE_PRICE_LIFETIME')!,
  }[plan]

  if (!priceId) {
    return new Response(
      JSON.stringify({ error: `Price ID not configured for plan: ${plan}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Get or create Stripe customer
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle()

  let customerId = profile?.stripe_customer_id as string | undefined
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email!,
      metadata: { supabase_uid: user.id },
    })
    customerId = customer.id
    await supabase
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id)
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

  return new Response(
    JSON.stringify({ url: session.url }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
