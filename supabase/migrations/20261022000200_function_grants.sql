-- Postgres grants EXECUTE on new functions to PUBLIC, and Supabase's default privileges also grant it to anon and
-- authenticated directly, so revoking from only one of them leaves the others. Every function below already refuses or returns
-- nothing for the wrong caller; this makes the database itself refuse.

-- Signed-in only.
revoke execute on function public.my_claims(), public.join_fan(), public.attach_claims(jsonb),
  public.simulate_claims(uuid, int), public.clear_simulated(uuid),
  public.join_team(uuid), public.create_sponsor(text, text, text[]) from anon;

-- Used by row level security policies, which run as the caller: keep them for authenticated, not for anon.
revoke execute on function public.my_team(), public.my_sponsor() from public, anon;
grant execute on function public.my_team(), public.my_sponsor() to authenticated;

-- Trigger functions: fired by the database, never called through the API.
revoke execute on function public.handle_new_user(), public.create_offer_key() from public, anon, authenticated;
