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

-- The technician's own name, used to sign customer messages ("Hi, it's John.").
-- Editable in Settings so they can go by a nickname if they want.
alter table public.profiles add column if not exists display_name text;

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
  attachments jsonb, -- [{ path, name, type }] photos/files stored in the visit-media bucket
  created_at timestamptz not null default now()
);

-- For existing databases:
alter table public.voice_notes add column if not exists customer_name text;
alter table public.voice_notes add column if not exists attachments jsonb;

-- Google Drive backup receipt: which customer folder this note synced into
-- and when. Written by the after-save sync; shown in the Archive as a
-- "View in Drive" link.
alter table public.voice_notes add column if not exists drive_folder_id text;
alter table public.voice_notes add column if not exists drive_synced_at timestamptz;

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
-- scheduled_visits: next visits the tech put on the calendar from a note's
-- "schedule next visit" step. Powers the Daily Digest tab.
-- ---------------------------------------------------------------------------
create table if not exists public.scheduled_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  note_id uuid references public.voice_notes (id) on delete set null,
  customer_name text,
  reason text, -- short "what this visit is about"
  todo text, -- a sentence or two on what to do
  kind text, -- 'visit' (on-site) or 'call' (phone reminder)
  address text, -- where the visit is; also the calendar event location
  scheduled_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- For databases created before kind/address existed:
alter table public.scheduled_visits add column if not exists kind text;
alter table public.scheduled_visits add column if not exists address text;

alter table public.scheduled_visits enable row level security;

drop policy if exists "own visits - select" on public.scheduled_visits;
create policy "own visits - select" on public.scheduled_visits
  for select using (auth.uid() = user_id);

drop policy if exists "own visits - insert" on public.scheduled_visits;
create policy "own visits - insert" on public.scheduled_visits
  for insert with check (auth.uid() = user_id);

drop policy if exists "own visits - update" on public.scheduled_visits;
create policy "own visits - update" on public.scheduled_visits
  for update using (auth.uid() = user_id);

drop policy if exists "own visits - delete" on public.scheduled_visits;
create policy "own visits - delete" on public.scheduled_visits
  for delete using (auth.uid() = user_id);

create index if not exists scheduled_visits_user_time_idx
  on public.scheduled_visits (user_id, scheduled_at);

-- ---------------------------------------------------------------------------
-- message_samples: messages the tech actually sent to customers. The AI reads
-- the most recent few to mimic the tech's writing style in future drafts.
-- ---------------------------------------------------------------------------
create table if not exists public.message_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.message_samples enable row level security;

drop policy if exists "own samples - select" on public.message_samples;
create policy "own samples - select" on public.message_samples
  for select using (auth.uid() = user_id);

drop policy if exists "own samples - insert" on public.message_samples;
create policy "own samples - insert" on public.message_samples
  for insert with check (auth.uid() = user_id);

drop policy if exists "own samples - delete" on public.message_samples;
create policy "own samples - delete" on public.message_samples
  for delete using (auth.uid() = user_id);

create index if not exists message_samples_user_created_idx
  on public.message_samples (user_id, created_at desc);

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

-- One entry per (name, email) per technician, so the same name can recur with
-- different emails (two different "John Smith"s) and get disambiguated by email.
-- Replaces the older name-only unique index.
drop index if exists public.customers_user_name_idx;
create unique index if not exists customers_user_name_email_idx
  on public.customers (user_id, lower(name), coalesce(lower(email), ''));

-- ---------------------------------------------------------------------------
-- Storage: a private bucket for visit photos & files. Each technician can only
-- touch files under their own user-id folder (path: <user_id>/<visit>/<file>).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('visit-media', 'visit-media', false)
on conflict (id) do nothing;

drop policy if exists "visit media - own files" on storage.objects;
create policy "visit media - own files" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'visit-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'visit-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- ---------------------------------------------------------------------------
-- Subscriptions: which plan a technician is on. plan_selected flips true once
-- they leave the plan-selection screen (Free or paid), so we only gate them to
-- it once, right after signup. The Stripe columns are written by the webhook.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists plan text not null default 'free';
alter table public.profiles add column if not exists plan_status text;
alter table public.profiles add column if not exists plan_selected boolean not null default false;
alter table public.profiles add column if not exists stripe_customer_id text;
alter table public.profiles add column if not exists stripe_subscription_id text;

create index if not exists profiles_stripe_customer_idx
  on public.profiles (stripe_customer_id);

-- ---------------------------------------------------------------------------
-- Google Drive backup: per-tech OAuth connection. Photos/files mirror into a
-- "TekScribe Records" folder in THEIR Drive, organized by customer.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists google_refresh_token text;
alter table public.profiles add column if not exists google_drive_email text;
alter table public.profiles add column if not exists google_drive_folder_id text;
