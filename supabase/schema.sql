-- TechTalk database schema
-- Paste this into the Supabase SQL Editor (Dashboard → SQL Editor → New query) and Run.

-- ---------------------------------------------------------------------------
-- profiles: one row per signed-up technician. Holds the phone number they add
-- after verifying their email. Linked 1:1 to auth.users.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  business_name text,
  phone text,
  created_at timestamptz not null default now()
);

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

-- Auto-create a profile row whenever a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
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
  transcript text not null,
  summary jsonb,
  customer_email text,
  created_at timestamptz not null default now()
);

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
