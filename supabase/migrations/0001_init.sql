-- Maple's World — initial schema.
-- Worlds are owned by one auth user (anonymous sign-in supported). Chunks are stored as
-- deflate+base64 payloads of the full 16³ block array, keyed by chunk coordinate; only
-- chunks the player or genie modified are stored — terrain is regenerated from the seed.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.worlds (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null default 'Maple''s World',
  seed integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists worlds_owner_idx on public.worlds(owner, updated_at desc);

create table if not exists public.world_chunks (
  world_id uuid not null references public.worlds(id) on delete cascade,
  cx integer not null,
  cy integer not null,
  cz integer not null,
  data text not null,                       -- base64(deflate-raw(Uint8Array[4096]))
  updated_at timestamptz not null default now(),
  primary key (world_id, cx, cy, cz),
  constraint world_chunks_data_size check (length(data) <= 16384)
);

-- Conversation memory for the genie, per world (optional, filled by the Edge Function).
create table if not exists public.genie_log (
  id bigserial primary key,
  world_id uuid not null references public.worlds(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  role text not null check (role in ('user','assistant','tool')),
  content jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists genie_log_world_idx on public.genie_log(world_id, created_at desc);

-- updated_at maintenance
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists worlds_touch on public.worlds;
create trigger worlds_touch before update on public.worlds for each row execute function public.touch_updated_at();
drop trigger if exists chunks_touch on public.world_chunks;
create trigger chunks_touch before update on public.world_chunks for each row execute function public.touch_updated_at();

-- Auto-create profile on signup
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles(id) values (new.id) on conflict do nothing; return new; end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- RLS: owners only.
alter table public.profiles enable row level security;
alter table public.worlds enable row level security;
alter table public.world_chunks enable row level security;
alter table public.genie_log enable row level security;

drop policy if exists "profiles self" on public.profiles;
create policy "profiles self" on public.profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "worlds owner" on public.worlds;
create policy "worlds owner" on public.worlds for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "chunks via world" on public.world_chunks;
create policy "chunks via world" on public.world_chunks for all to authenticated
  using (exists (select 1 from public.worlds w where w.id = world_id and w.owner = auth.uid()))
  with check (exists (select 1 from public.worlds w where w.id = world_id and w.owner = auth.uid()));

drop policy if exists "genie_log via world" on public.genie_log;
create policy "genie_log via world" on public.genie_log for all to authenticated
  using (exists (select 1 from public.worlds w where w.id = world_id and w.owner = auth.uid()))
  with check (exists (select 1 from public.worlds w where w.id = world_id and w.owner = auth.uid()));

-- Rate limiting for the genie: one row per user per minute window.
create table if not exists public.genie_usage (
  user_id uuid not null,
  minute timestamptz not null,
  calls integer not null default 0,
  primary key (user_id, minute)
);
alter table public.genie_usage enable row level security;   -- no policies: service role only

create or replace function public.genie_take_token(p_user uuid, p_limit integer default 20)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_calls integer;
begin
  insert into public.genie_usage(user_id, minute, calls)
    values (p_user, date_trunc('minute', now()), 1)
    on conflict (user_id, minute) do update set calls = genie_usage.calls + 1
    returning calls into v_calls;
  delete from public.genie_usage where minute < now() - interval '1 hour';
  return v_calls <= p_limit;
end $$;
revoke all on function public.genie_take_token(uuid, integer) from public, anon, authenticated;
