-- Run in the Supabase SQL Editor. No private values in this migration.
create table if not exists public.care_state (
  id integer primary key check (id = 1),
  data jsonb,
  revision integer not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.care_state(id) values(1) on conflict do nothing;
create table if not exists public.care_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists public.care_deliveries (
  subscription_id uuid not null references public.care_subscriptions(id) on delete cascade,
  slot text not null,
  status text not null default 'sending' check(status in ('sending','sent','failed')),
  updated_at timestamptz not null default now(),
  primary key(subscription_id,slot)
);
alter table public.care_state enable row level security;
alter table public.care_subscriptions enable row level security;
alter table public.care_deliveries enable row level security;
revoke all on public.care_state, public.care_subscriptions, public.care_deliveries from anon, authenticated;
grant all on public.care_state, public.care_subscriptions, public.care_deliveries to service_role;
-- Deliberately no public policies. Only the authenticated Edge Function can access records.
