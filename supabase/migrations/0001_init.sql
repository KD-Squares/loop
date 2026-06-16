-- =============================================================================
-- Loop — 0001_init.sql
-- Core schema: profiles, quizzes, questions, games, game_players,
-- answers, game_results.
--
-- Design notes:
--  * UUID primary keys everywhere (gen_random_uuid()) except natural columns.
--  * A question's correct answer is tracked BY IDENTITY (correct_option_id),
--    never by position, so option shuffling in a live game can never corrupt it.
--  * game_results is intentionally DECOUPLED from quizzes (no FK cascade): the
--    quiz title is snapshotted so deleting a quiz later never erases history.
-- =============================================================================

-- Needed for gen_random_uuid()
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- profiles — one row per host (mirrors auth.users via id = auth.uid())
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text,
  created_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- quizzes — a host's saved quiz (the library)
-- -----------------------------------------------------------------------------
create table if not exists public.quizzes (
  id              uuid primary key default gen_random_uuid(),
  host_id         uuid not null references public.profiles (id) on delete cascade,
  title           text not null,
  status          text not null default 'draft'
                    check (status in ('draft', 'ready')),
  -- Single per-question time limit (5–120s) applied to EVERY question, set once
  -- during quiz creation. Stored on the quiz, not per question.
  time_limit_seconds integer not null default 20
                    check (time_limit_seconds between 5 and 120),
  source_pdf_path text,                         -- path inside the private `pdfs` bucket
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists quizzes_host_id_idx on public.quizzes (host_id);

-- -----------------------------------------------------------------------------
-- questions — belong to a quiz
--  * type: 'mcq' (4 options) | 'truefalse' (2 options)
--  * options: jsonb array of { id: string, text: string }
--  * correct_option_id: references one option's id WITHIN the options array
-- -----------------------------------------------------------------------------
create table if not exists public.questions (
  id                uuid primary key default gen_random_uuid(),
  quiz_id           uuid not null references public.quizzes (id) on delete cascade,
  text              text not null,
  type              text not null check (type in ('mcq', 'truefalse')),
  options           jsonb not null default '[]'::jsonb,
  correct_option_id text not null,
  order_index       integer not null default 0,
  created_at        timestamptz not null default now()
);
create index if not exists questions_quiz_id_idx on public.questions (quiz_id);

-- -----------------------------------------------------------------------------
-- games — a single live launch of a quiz (independent each time)
-- -----------------------------------------------------------------------------
create table if not exists public.games (
  id            uuid primary key default gen_random_uuid(),
  quiz_id       uuid references public.quizzes (id) on delete set null,
  host_id       uuid not null references public.profiles (id) on delete cascade,
  pin           text not null,
  status        text not null default 'lobby'
                  check (status in ('lobby', 'active', 'paused', 'finished')),
  current_round integer not null default 0,
  created_at    timestamptz not null default now(),
  ended_at      timestamptz
);
create index if not exists games_host_id_idx on public.games (host_id);
-- Only one non-finished game may hold a given PIN at a time.
create unique index if not exists games_active_pin_idx
  on public.games (pin)
  where status in ('lobby', 'active', 'paused');

-- -----------------------------------------------------------------------------
-- game_players — anonymous players within a game
-- -----------------------------------------------------------------------------
create table if not exists public.game_players (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references public.games (id) on delete cascade,
  nickname      text not null,
  total_score   numeric not null default 0,
  total_time_ms bigint not null default 0,
  joined_at     timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);
create index if not exists game_players_game_id_idx on public.game_players (game_id);
-- No two identical nicknames within the same game (disambiguation happens server-side).
create unique index if not exists game_players_game_nickname_idx
  on public.game_players (game_id, nickname);

-- -----------------------------------------------------------------------------
-- answers — one captured answer per player per question (idempotent per round)
-- -----------------------------------------------------------------------------
create table if not exists public.answers (
  id                 uuid primary key default gen_random_uuid(),
  game_id            uuid not null references public.games (id) on delete cascade,
  question_id        uuid not null references public.questions (id) on delete cascade,
  player_id          uuid not null references public.game_players (id) on delete cascade,
  selected_option_id text,                       -- null = no answer / timed out
  time_taken_ms      integer,
  points_awarded     numeric not null default 0,
  created_at         timestamptz not null default now()
);
create index if not exists answers_game_id_idx on public.answers (game_id);
-- Enforce one answer per player per question at the DB layer (defense in depth;
-- the realtime server is the primary idempotency guard).
create unique index if not exists answers_unique_per_round_idx
  on public.answers (game_id, question_id, player_id);

-- -----------------------------------------------------------------------------
-- game_results — final snapshot, decoupled from the quiz (history survives delete)
--  * ranking: jsonb array of { rank, nickname, total_score, total_time_ms }
-- -----------------------------------------------------------------------------
create table if not exists public.game_results (
  id                  uuid primary key default gen_random_uuid(),
  game_id             uuid references public.games (id) on delete set null,
  host_id             uuid not null references public.profiles (id) on delete cascade,
  quiz_title_snapshot text not null,
  finished_at         timestamptz not null default now(),
  ranking             jsonb not null default '[]'::jsonb
);
create index if not exists game_results_host_id_idx on public.game_results (host_id);

-- -----------------------------------------------------------------------------
-- updated_at maintenance for quizzes
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists quizzes_set_updated_at on public.quizzes;
create trigger quizzes_set_updated_at
  before update on public.quizzes
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Auto-create a profile row when a new auth user signs up
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
