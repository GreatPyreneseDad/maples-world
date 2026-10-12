-- Record which pip-engine version each published game was built against.
alter table public.wished_games add column if not exists engine_version text check (engine_version is null or char_length(engine_version) <= 20);
update public.wished_games set engine_version = '0.1.0' where engine_version is null;
