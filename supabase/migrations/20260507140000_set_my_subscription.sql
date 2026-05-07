-- Lets the app set subscription_status for the signed-in user even when RLS blocks
-- direct UPDATE on profiles (common cause: "Get Pro" appears to do nothing / stays expired).
--
-- Run in Supabase SQL Editor or: supabase db push

create or replace function public.set_my_subscription(p_status text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  v text;
begin
  v := lower(trim(p_status));
  if v not in ('trial', 'active', 'expired', 'lifetime') then
    raise exception 'invalid subscription status';
  end if;

  update public.profiles
  set subscription_status = v
  where id = auth.uid();

  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.set_my_subscription(text) from public;
grant execute on function public.set_my_subscription(text) to authenticated;
