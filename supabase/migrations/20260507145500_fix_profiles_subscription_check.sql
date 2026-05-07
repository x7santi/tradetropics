-- Fix invalid CHECK constraint rejecting app statuses ('active', 'lifetime').
-- Error seen in app:
--   new row for relation "profiles" violates check constraint "profiles_subscription_status_check"
--
-- Run in Supabase SQL Editor or via CLI: supabase db push

-- Normalize likely legacy values before tightening constraints.
update public.profiles
set subscription_status = case lower(trim(subscription_status))
  when 'pro' then 'active'
  when 'paid' then 'active'
  when 'free' then 'trial'
  else lower(trim(subscription_status))
end
where subscription_status is not null;

-- Ensure only app-supported values are allowed.
alter table public.profiles
  drop constraint if exists profiles_subscription_status_check;

alter table public.profiles
  add constraint profiles_subscription_status_check
  check (subscription_status in ('trial', 'active', 'expired', 'lifetime'));

-- Keep a sane default for new rows.
alter table public.profiles
  alter column subscription_status set default 'trial';
