-- =============================================================================
-- Loop — 0002_rls.sql
-- Row Level Security.
--
-- Principle:
--  * A host (authenticated user) can read/write ONLY their own rows.
--  * Players are anonymous and NEVER touch the DB directly — all player writes
--    go through the realtime server using the service-role key, which bypasses
--    RLS. So there are deliberately NO anon policies on player-facing tables.
--  * game_results stays readable by its owning host even after the quiz/game
--    is deleted (history survives).
-- =============================================================================

alter table public.profiles      enable row level security;
alter table public.quizzes       enable row level security;
alter table public.questions     enable row level security;
alter table public.games         enable row level security;
alter table public.game_players  enable row level security;
alter table public.answers       enable row level security;
alter table public.game_results  enable row level security;

-- -----------------------------------------------------------------------------
-- profiles — a host can see and edit only their own profile
-- -----------------------------------------------------------------------------
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- quizzes — owned by host_id
-- -----------------------------------------------------------------------------
drop policy if exists quizzes_all_own on public.quizzes;
create policy quizzes_all_own on public.quizzes
  for all
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);

-- -----------------------------------------------------------------------------
-- questions — owned transitively via the parent quiz
-- -----------------------------------------------------------------------------
drop policy if exists questions_all_own on public.questions;
create policy questions_all_own on public.questions
  for all
  using (
    exists (
      select 1 from public.quizzes q
      where q.id = questions.quiz_id and q.host_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.quizzes q
      where q.id = questions.quiz_id and q.host_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- games — owned by host_id. (The realtime server uses service-role and bypasses
-- RLS; these policies let the host's browser read its own games for the UI.)
-- -----------------------------------------------------------------------------
drop policy if exists games_all_own on public.games;
create policy games_all_own on public.games
  for all
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);

-- -----------------------------------------------------------------------------
-- game_players — host of the parent game may read (for the leaderboard UI).
-- Writes happen via service-role only.
-- -----------------------------------------------------------------------------
drop policy if exists game_players_select_own on public.game_players;
create policy game_players_select_own on public.game_players
  for select
  using (
    exists (
      select 1 from public.games g
      where g.id = game_players.game_id and g.host_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- answers — host of the parent game may read. Writes via service-role only.
-- -----------------------------------------------------------------------------
drop policy if exists answers_select_own on public.answers;
create policy answers_select_own on public.answers
  for select
  using (
    exists (
      select 1 from public.games g
      where g.id = answers.game_id and g.host_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- game_results — owned by host_id directly (survives quiz/game deletion)
-- -----------------------------------------------------------------------------
drop policy if exists game_results_select_own on public.game_results;
create policy game_results_select_own on public.game_results
  for select using (auth.uid() = host_id);
