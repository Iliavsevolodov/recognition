-- Recognition service schema.
-- Applied to the existing Business Session Admin Supabase project.
-- All objects are isolated with the recognition_ prefix.

create table if not exists public.recognition_submissions (
  id uuid primary key default gen_random_uuid(),
  recognition_type text not null check (recognition_type in ('pv500','qualification')),
  first_name text not null,
  last_name text not null,
  partner_id text not null,
  qualification text null check (qualification in ('S1','S2','L','L1 PRO','L2','L2 PRO','L3','L3 PRO')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  notified_at timestamptz null,
  constraint recognition_qualification_shape check (
    (recognition_type = 'pv500' and qualification is null)
    or (recognition_type = 'qualification' and qualification is not null)
  )
);

create unique index if not exists recognition_unique_pv500
  on public.recognition_submissions ((lower(trim(partner_id))))
  where recognition_type = 'pv500';

create unique index if not exists recognition_unique_qualification
  on public.recognition_submissions ((lower(trim(partner_id))), qualification)
  where recognition_type = 'qualification';

-- The production project also contains security-definer RPC functions:
-- recognition_submit
-- recognition_admin_login
-- recognition_admin_list
-- recognition_admin_stats
-- recognition_admin_update
-- recognition_admin_delete
-- Base-table access is revoked from anon/authenticated roles and RLS is enabled.
