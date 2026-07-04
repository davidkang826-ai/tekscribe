-- TekScribe database schema
-- Paste this into the Supabase SQL Editor (Dashboard → SQL Editor → New query) and Run.

-- ---------------------------------------------------------------------------
-- profiles: one row per signed-up technician. Holds the phone number they add
-- after verifying their email. Linked 1:1 to auth.users.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  business_name text,
  phone text,
  reply_to_email text, -- where customer email replies should go (defaults to signup email)
  created_at timestamptz not null default now()
);

-- For existing databases created before reply_to_email existed:
alter table public.profiles add column if not exists reply_to_email text;

alter table public.profiles enable row level security;

drop policy if exists "own profile - select" on public.profiles;
create policy "own profile - select" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "own profile - upsert" on public.profiles;
create policy "own profile - upsert" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "own profile - update" on public.profiles;
create policy "own profile - update" on public.profiles
  for update using (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user is created. Carries the
-- business name captured at signup so we never ask for it again at onboarding.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, business_name)
  values (new.id, nullif(new.raw_user_meta_data->>'business_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- voice_notes: each saved job. Stores the raw transcript and the structured
-- AI summary (as JSON) so we can re-render bullets and the customer message.
-- ---------------------------------------------------------------------------
create table if not exists public.voice_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_title text,
  customer_name text, -- optional: group jobs by the customer served
  transcript text not null,
  summary jsonb,
  customer_email text,
  created_at timestamptz not null default now()
);

-- For existing databases created before customer_name existed:
alter table public.voice_notes add column if not exists customer_name text;

alter table public.voice_notes enable row level security;

drop policy if exists "own notes - select" on public.voice_notes;
create policy "own notes - select" on public.voice_notes
  for select using (auth.uid() = user_id);

drop policy if exists "own notes - insert" on public.voice_notes;
create policy "own notes - insert" on public.voice_notes
  for insert with check (auth.uid() = user_id);

drop policy if exists "own notes - update" on public.voice_notes;
create policy "own notes - update" on public.voice_notes
  for update using (auth.uid() = user_id);

drop policy if exists "own notes - delete" on public.voice_notes;
create policy "own notes - delete" on public.voice_notes
  for delete using (auth.uid() = user_id);

create index if not exists voice_notes_user_created_idx
  on public.voice_notes (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- templates: reusable documents (invoice, work order, inspection report...)
-- that the AI fills out from the spoken note. Owned per technician.
-- ---------------------------------------------------------------------------
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.templates enable row level security;

drop policy if exists "own templates - select" on public.templates;
create policy "own templates - select" on public.templates
  for select using (auth.uid() = user_id);

drop policy if exists "own templates - insert" on public.templates;
create policy "own templates - insert" on public.templates
  for insert with check (auth.uid() = user_id);

drop policy if exists "own templates - update" on public.templates;
create policy "own templates - update" on public.templates
  for update using (auth.uid() = user_id);

drop policy if exists "own templates - delete" on public.templates;
create policy "own templates - delete" on public.templates
  for delete using (auth.uid() = user_id);

create index if not exists templates_user_created_idx
  on public.templates (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- customers: a per-technician contact directory so email/phone are saved once
-- and recalled next time that customer is served.
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

alter table public.customers enable row level security;

drop policy if exists "own customers - select" on public.customers;
create policy "own customers - select" on public.customers
  for select using (auth.uid() = user_id);

drop policy if exists "own customers - insert" on public.customers;
create policy "own customers - insert" on public.customers
  for insert with check (auth.uid() = user_id);

drop policy if exists "own customers - update" on public.customers;
create policy "own customers - update" on public.customers
  for update using (auth.uid() = user_id);

drop policy if exists "own customers - delete" on public.customers;
create policy "own customers - delete" on public.customers
  for delete using (auth.uid() = user_id);

-- One entry per customer name (case-insensitive) per technician.
create unique index if not exists customers_user_name_idx
  on public.customers (user_id, lower(name));
