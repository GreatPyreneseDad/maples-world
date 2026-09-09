-- Field journal: species the player has identified, per world.
create table if not exists public.discoveries (
  world_id uuid not null references public.worlds(id) on delete cascade,
  species_id text not null,
  discovered_at timestamptz not null default now(),
  primary key (world_id, species_id)
);
alter table public.discoveries enable row level security;
drop policy if exists "discoveries via world" on public.discoveries;
create policy "discoveries via world" on public.discoveries for all to authenticated
  using (exists (select 1 from public.worlds w where w.id = world_id and w.owner = auth.uid()))
  with check (exists (select 1 from public.worlds w where w.id = world_id and w.owner = auth.uid()));
