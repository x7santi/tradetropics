-- Fix: new profile rows should start as trial, not expired.
-- If subscription_status defaulted to 'expired', every login after signup looked "reset" to expired.
--
-- Run in Supabase SQL Editor or via CLI: supabase db push

alter table public.profiles
  alter column subscription_status set default 'trial';

-- Optional: backfill only rows that still have the old default and no paid state
-- (uncomment if you intentionally used 'expired' as default for new users)
-- update public.profiles
-- set subscription_status = 'trial'
-- where subscription_status = 'expired'
--   and created_at > now() - interval '1 day';
