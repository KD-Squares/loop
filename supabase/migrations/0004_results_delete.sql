-- =============================================================================
-- Loop — 0004_results_delete.sql
-- Allow a host to delete their own past results.
--
-- The /api/results/[id] route performs the delete with the service-role client
-- (after verifying ownership), so this policy is not strictly required for the
-- feature to work. It is added for schema correctness and local parity, so a
-- host's own session could also delete directly under RLS.
-- =============================================================================

drop policy if exists game_results_delete_own on public.game_results;
create policy game_results_delete_own on public.game_results
  for delete using (auth.uid() = host_id);
