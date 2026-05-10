-- Add billing_period so annual vs monthly can be persisted in Supabase (not just client-side).
-- Values: 'monthly' | 'yearly' | NULL

alter table public.profiles
  add column if not exists billing_period text;

-- Optional: keep values sane if column already exists with other data
-- (no hard constraint here to avoid migrations failing on existing unexpected values)
