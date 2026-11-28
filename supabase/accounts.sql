-- Emberglade accounts: a name and a password, kept in this project. No email is ever sent or asked for.
-- Run this once, after schema.sql: SQL Editor -> New query -> paste -> Run. It is safe to run again.
-- Guest sign-in must be on (Authentication -> Sign In / Providers -> Anonymous sign-ins), as schema.sql asks.
--
-- How it works. Every browser already signs in as an anonymous guest and owns its own rows. An account
-- is a name and a password hash that belong to the guest who registered it (its owner). Logging in on
-- another device records that this device's guest is now acting for that owner, and the access rules
-- below let it read and write the owner's rows. Passwords are stored only as bcrypt hashes.
--
-- Do not delete the anonymous users who own accounts (Authentication -> Users): their worlds go with them.
--
-- A player who forgets their password cannot reset it themselves (there is no email to send a link to).
-- You can set a new one for them here in the SQL Editor:
--   select public.admin_reset_password('TheirName', 'a new password');

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  pass_hash text not null,
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  failed smallint not null default 0, -- wrong passwords in a row
  locked_until timestamptz, -- no log-ins before this, after too many wrong passwords
  created_at timestamptz not null default now()
);
-- names are unique whatever their capitals: "Wren" and "wren" are the same player
create unique index if not exists accounts_username on public.accounts (lower(username));

-- which account each signed-in browser is acting for
create table if not exists public.account_sessions (
  auth_id uuid primary key references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Nobody reads or writes these two tables directly: only the functions below touch them.
alter table public.accounts enable row level security;
alter table public.account_sessions enable row level security;
revoke all on public.accounts, public.account_sessions from anon, authenticated;

-- Whose rows this session may use: the owner of the account it is logged in to, or else its own.
create or replace function public.acting_as() returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select a.owner_id from public.account_sessions s join public.accounts a on a.id = s.account_id where s.auth_id = auth.uid()),
    auth.uid()
  );
$$;

-- Make an account for the guest now signed in. Their guest worlds become the account's worlds.
create or replace function public.register_account(p_name text, p_pass text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  acc public.accounts;
begin
  if me is null then return jsonb_build_object('ok', false, 'message', 'Not connected.'); end if;
  p_name := btrim(coalesce(p_name, ''));
  if p_name !~ '^[A-Za-z0-9_]{3,20}$' then
    return jsonb_build_object('ok', false, 'message', 'A name is 3 to 20 letters, numbers or underscores.');
  end if;
  if p_pass is null or length(p_pass) < 8 or length(p_pass) > 72 then
    return jsonb_build_object('ok', false, 'message', 'A password is 8 to 72 characters.');
  end if;
  if exists (select 1 from public.account_sessions where auth_id = me) or exists (select 1 from public.accounts where owner_id = me) then
    return jsonb_build_object('ok', false, 'message', 'This device is already signed in to an account. Sign out first.');
  end if;
  if exists (select 1 from public.accounts where lower(username) = lower(p_name)) then
    return jsonb_build_object('ok', false, 'message', 'That name is taken.');
  end if;
  begin
    insert into public.accounts (username, pass_hash, owner_id)
    values (p_name, extensions.crypt(p_pass, extensions.gen_salt('bf', 10)), me)
    returning * into acc;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'message', 'That name is taken.');
  end;
  insert into public.account_sessions (auth_id, account_id) values (me, acc.id);
  return jsonb_build_object('ok', true, 'username', acc.username, 'user_id', acc.owner_id);
end;
$$;

-- Log this device in to an account. Eight wrong passwords in a row lock the account for ten minutes.
-- A wrong name and a wrong password give the same answer, so names cannot be fished for.
create or replace function public.login_account(p_name text, p_pass text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  acc public.accounts;
  wrong constant jsonb := jsonb_build_object('ok', false, 'message', 'Wrong name or password.');
begin
  if me is null then return jsonb_build_object('ok', false, 'message', 'Not connected.'); end if;
  select * into acc from public.accounts where lower(username) = lower(btrim(coalesce(p_name, '')));
  if not found then
    perform extensions.crypt(coalesce(p_pass, ''), extensions.gen_salt('bf', 10)); -- take as long as a real check would
    return wrong;
  end if;
  if acc.locked_until is not null and acc.locked_until > now() then
    return jsonb_build_object('ok', false, 'message', 'Too many wrong passwords. Try again in a few minutes.');
  end if;
  if p_pass is not null and acc.pass_hash = extensions.crypt(p_pass, acc.pass_hash) then
    update public.accounts set failed = 0, locked_until = null where id = acc.id;
    insert into public.account_sessions (auth_id, account_id) values (me, acc.id)
    on conflict (auth_id) do update set account_id = excluded.account_id, created_at = now();
    return jsonb_build_object('ok', true, 'username', acc.username, 'user_id', acc.owner_id);
  end if;
  update public.accounts
  set failed = case when failed + 1 >= 8 then 0 else failed + 1 end,
      locked_until = case when failed + 1 >= 8 then now() + interval '10 minutes' else null end
  where id = acc.id;
  return wrong;
end;
$$;

-- The account this session is logged in to ({ username, user_id }), or null for a plain guest.
create or replace function public.account_whoami() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('username', a.username, 'user_id', a.owner_id)
  from public.account_sessions s join public.accounts a on a.id = s.account_id
  where s.auth_id = auth.uid();
$$;

-- Stop acting for the account. The game also ends the guest session itself, so the device starts afresh.
create or replace function public.logout_account() returns void
language sql security definer set search_path = '' as $$
  delete from public.account_sessions where auth_id = auth.uid();
$$;

-- For you, in the SQL Editor only: give a player a new password. Their other devices are signed out.
create or replace function public.admin_reset_password(p_name text, p_pass text) returns text
language plpgsql set search_path = '' as $$
declare
  acc public.accounts;
begin
  if p_pass is null or length(p_pass) < 8 or length(p_pass) > 72 then return 'A password is 8 to 72 characters.'; end if;
  select * into acc from public.accounts where lower(username) = lower(btrim(coalesce(p_name, '')));
  if not found then return 'No account has that name.'; end if;
  update public.accounts set pass_hash = extensions.crypt(p_pass, extensions.gen_salt('bf', 10)), failed = 0, locked_until = null where id = acc.id;
  delete from public.account_sessions where account_id = acc.id and auth_id <> acc.owner_id;
  return 'Password changed for ' || acc.username || '.';
end;
$$;

-- Players call the account functions through the game; nobody but you may call the admin one.
revoke execute on function public.acting_as(), public.register_account(text, text), public.login_account(text, text),
  public.account_whoami(), public.logout_account() from public, anon;
grant execute on function public.acting_as(), public.register_account(text, text), public.login_account(text, text),
  public.account_whoami(), public.logout_account() to authenticated;
revoke execute on function public.admin_reset_password(text, text) from public, anon, authenticated;

-- The access rules of schema.sql again, now by who the session is acting for rather than who it is.
drop policy if exists "own saves" on public.saves;
create policy "own saves" on public.saves for all to authenticated
  using ((select public.acting_as()) = user_id) with check ((select public.acting_as()) = user_id);

drop policy if exists "write own progress" on public.players;
create policy "write own progress" on public.players for insert to authenticated with check ((select public.acting_as()) = user_id);
drop policy if exists "update own progress" on public.players;
create policy "update own progress" on public.players for update to authenticated
  using ((select public.acting_as()) = user_id) with check ((select public.acting_as()) = user_id);

drop policy if exists "own events" on public.events;
create policy "own events" on public.events for select to authenticated using ((select public.acting_as()) = user_id);
drop policy if exists "log own events" on public.events;
create policy "log own events" on public.events for insert to authenticated with check ((select public.acting_as()) = user_id);
