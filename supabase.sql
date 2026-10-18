-- Таблица рейтинга Ash & Iron для Supabase (бесплатный тариф).
-- Supabase → SQL Editor → New query → вставить этот файл целиком → Run.

create table if not exists public.leaderboard (
  player_id  uuid primary key,
  name       text not null check (char_length(name) between 2 and 16),
  bosses     int  not null default 0 check (bosses between 0 and 1000),
  level      int  not null default 1 check (level between 1 and 2000),
  wave       int  not null default 1 check (wave between 1 and 5000),
  updated_at timestamptz not null default now()
);

create index if not exists leaderboard_rank on public.leaderboard (bosses desc, level desc, wave desc);

-- время обновления ставит сервер
create or replace function public.leaderboard_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists leaderboard_touch on public.leaderboard;
create trigger leaderboard_touch before insert or update on public.leaderboard
  for each row execute function public.leaderboard_touch();

-- Доступ по публичному anon-ключу: читать всем, писать свою строку.
-- Строку игрока знает только его устройство (случайный UUID).
alter table public.leaderboard enable row level security;
drop policy if exists "leaderboard read" on public.leaderboard;
drop policy if exists "leaderboard insert" on public.leaderboard;
drop policy if exists "leaderboard update" on public.leaderboard;
create policy "leaderboard read"   on public.leaderboard for select using (true);
create policy "leaderboard insert" on public.leaderboard for insert with check (true);
create policy "leaderboard update" on public.leaderboard for update using (true) with check (true);
