-- Per-visitor daily budget for the Genie Game Maker now that it has no passcode.
-- Stores a salted hash of the visitor's IP, never the IP itself; rows older than two days are purged.
create table if not exists public.maker_ip (day date not null, ip_hash text not null, points integer not null default 0, primary key (day, ip_hash));
alter table public.maker_ip enable row level security;
revoke all on public.maker_ip from anon, authenticated;
create or replace function public.maker_ip_bump(h text, cost integer, cap integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare today date := (now() at time zone 'America/Denver')::date; p integer;
begin
  if random() < 0.02 then delete from public.maker_ip where day < today - 2; end if;
  insert into public.maker_ip (day, ip_hash) values (today, h) on conflict do nothing;
  select points into p from public.maker_ip where day = today and ip_hash = h for update;
  if p + cost > cap then return false; end if;
  update public.maker_ip set points = points + cost where day = today and ip_hash = h;
  return true;
end $$;
revoke all on function public.maker_ip_bump(text, integer, integer) from public, anon, authenticated;
grant execute on function public.maker_ip_bump(text, integer, integer) to service_role;
