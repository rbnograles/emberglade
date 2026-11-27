-- Emberglade cloud storage. Run this once in your Supabase project: SQL Editor -> New query -> paste -> Run.
-- Also turn on guest sign-in: Authentication -> Sign In / Providers -> Anonymous sign-ins -> enable.
--
-- Every row belongs to the guest who wrote it. Row level security lets a guest see and change only
-- their own saves and events. The players table can be read by anyone, so it can feed a leaderboard;
-- it holds no names or contact details, only progress numbers.

create table if not exists public.saves (
  user_id uuid not null references auth.users (id) on delete cascade,
  slot smallint not null check (slot between 1 and 3),
  data jsonb not null,
  day integer not null default 1,
  level integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, slot)
);

create table if not exists public.players (
  user_id uuid not null references auth.users (id) on delete cascade,
  slot smallint not null check (slot between 1 and 3),
  seed bigint,
  day integer not null default 1,
  level integer not null default 1,
  difficulty text,
  goals_done integer not null default 0,
  keepers_found integer not null default 0,
  keepers_restored integer not null default 0,
  finished boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, slot)
);

create table if not exists public.events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slot smallint not null default 1,
  type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_user_time on public.events (user_id, created_at desc);

alter table public.saves enable row level security;
alter table public.players enable row level security;
alter table public.events enable row level security;

drop policy if exists "own saves" on public.saves;
create policy "own saves" on public.saves for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "read progress" on public.players;
create policy "read progress" on public.players for select to anon, authenticated using (true);
drop policy if exists "write own progress" on public.players;
create policy "write own progress" on public.players for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "update own progress" on public.players;
create policy "update own progress" on public.players for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own events" on public.events;
create policy "own events" on public.events for select to authenticated using (auth.uid() = user_id);
drop policy if exists "log own events" on public.events;
create policy "log own events" on public.events for insert to authenticated with check (auth.uid() = user_id);
