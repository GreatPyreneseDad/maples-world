-- Wished Games: games published from the Genie Game Maker. No personal data.
-- Access only through the `maker` edge function (service role); RLS on with no policies.
create table if not exists public.wished_games (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  icon text not null default '🎮' check (char_length(icon) <= 16),
  how text not null default '' check (char_length(how) <= 200),
  pre text not null default '' check (char_length(pre) <= 40000),
  code text not null check (char_length(code) between 20 and 60000),
  music_url text,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.wished_games enable row level security;
revoke all on public.wished_games from anon, authenticated;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wished-music', 'wished-music', true, 2000000, array['audio/mpeg'])
on conflict (id) do nothing;
