-- Daily counters for the Genie Game Maker spending cap. No personal data.
create table if not exists public.maker_usage (
  day date primary key,
  new_games integer not null default 0,
  builds integer not null default 0
);
alter table public.maker_usage enable row level security;
revoke all on public.maker_usage from anon, authenticated;
create or replace function public.maker_bump(is_new boolean, new_cap integer, build_cap integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare r public.maker_usage;
begin
  insert into public.maker_usage (day) values ((now() at time zone 'America/Denver')::date) on conflict (day) do nothing;
  select * into r from public.maker_usage where day = (now() at time zone 'America/Denver')::date for update;
  if r.builds >= build_cap or (is_new and r.new_games >= new_cap) then return false; end if;
  update public.maker_usage set builds = builds + 1, new_games = new_games + (case when is_new then 1 else 0 end) where day = r.day;
  return true;
end $$;
revoke all on function public.maker_bump(boolean, integer, integer) from public, anon, authenticated;
grant execute on function public.maker_bump(boolean, integer, integer) to service_role;
