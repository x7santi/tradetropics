-- Harden billing_period: validation constraint, period-end visibility column,
-- atomic set_my_subscription RPC (no more double-write from the client),
-- and a service-role-only admin_set_subscription for Supabase Dashboard management.

-- 1. Ensure billing_period column exists (idempotent — safe even if already added)
alter table public.profiles
  add column if not exists billing_period text;

-- 2. Clean up any stale garbage values before constraining
update public.profiles
set billing_period = null
where billing_period is not null
  and billing_period not in ('monthly', 'yearly');

-- 3. Add CHECK constraint (drop first to allow re-running safely)
alter table public.profiles
  drop constraint if exists profiles_billing_period_check;

alter table public.profiles
  add constraint profiles_billing_period_check
  check (billing_period is null or billing_period in ('monthly', 'yearly'));

-- 4. Track when the current subscription period ends (visible in Dashboard table view)
alter table public.profiles
  add column if not exists subscription_period_end timestamptz;

-- 5. Replace set_my_subscription with a version that handles billing_period atomically.
--    Old signature: set_my_subscription(text)
--    New signature: set_my_subscription(text, text, timestamptz)  <- extra params default null
--    Existing client calls with { p_status } still work; new calls can pass p_billing_period.
drop function if exists public.set_my_subscription(text);

create or replace function public.set_my_subscription(
  p_status         text,
  p_billing_period text        default null,
  p_period_end     timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  v text;
  b text;
begin
  v := lower(trim(p_status));
  if v not in ('trial', 'active', 'expired', 'lifetime') then
    raise exception 'invalid subscription status: %', p_status;
  end if;

  if p_billing_period is not null then
    b := lower(trim(p_billing_period));
    if b not in ('monthly', 'yearly') then
      raise exception 'invalid billing period: %', p_billing_period;
    end if;
  end if;

  update public.profiles
  set
    subscription_status     = v,
    -- For active: use supplied billing_period or fall back to the existing value (upgrade path).
    -- For all other statuses: clear billing info.
    billing_period          = case
                                when v = 'active' then coalesce(b, billing_period)
                                else null
                              end,
    subscription_period_end = case
                                when v = 'active' then p_period_end
                                else null
                              end
  where id = auth.uid();

  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.set_my_subscription(text, text, timestamptz) from public;
grant execute on function public.set_my_subscription(text, text, timestamptz) to authenticated;

-- 6. Admin function — set billing for any user by UUID.
--    Callable only by service_role (e.g. from Supabase Dashboard SQL editor or Edge Functions).
--
--    Usage from Dashboard SQL editor:
--      select public.admin_set_subscription(
--        '<user-uuid>',
--        'active',
--        'yearly',
--        now() + interval '1 year'
--      );
--
--      -- Revoke / expire a user:
--      select public.admin_set_subscription('<user-uuid>', 'expired');

drop function if exists public.admin_set_subscription(uuid, text, text, timestamptz);

create or replace function public.admin_set_subscription(
  p_user_id        uuid,
  p_status         text,
  p_billing_period text        default null,
  p_period_end     timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n        int;
  v        text;
  b        text;
  jwt_role text;
begin
  -- Reject calls that arrive via PostgREST with a non-service-role JWT.
  -- Direct DB connections (Dashboard SQL editor, migrations) have no JWT claims — allowed.
  jwt_role := coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb->>'role';

  if jwt_role is not null and jwt_role != 'service_role' then
    raise exception 'permission denied for function admin_set_subscription';
  end if;

  v := lower(trim(p_status));
  if v not in ('trial', 'active', 'expired', 'lifetime') then
    raise exception 'invalid subscription status: %', p_status;
  end if;

  if p_billing_period is not null then
    b := lower(trim(p_billing_period));
    if b not in ('monthly', 'yearly') then
      raise exception 'invalid billing period: %', p_billing_period;
    end if;
  end if;

  update public.profiles
  set
    subscription_status     = v,
    billing_period          = case when v = 'active' then b else null end,
    subscription_period_end = case when v = 'active' then p_period_end else null end
  where id = p_user_id;

  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- Belt-and-suspenders: revoke from every non-service role explicitly.
-- Supabase assigns blanket EXECUTE to anon/authenticated by default, so
-- REVOKE FROM PUBLIC alone is not sufficient.
revoke all on function public.admin_set_subscription(uuid, text, text, timestamptz) from public;
revoke all on function public.admin_set_subscription(uuid, text, text, timestamptz) from anon;
revoke all on function public.admin_set_subscription(uuid, text, text, timestamptz) from authenticated;
grant execute on function public.admin_set_subscription(uuid, text, text, timestamptz) to service_role;
