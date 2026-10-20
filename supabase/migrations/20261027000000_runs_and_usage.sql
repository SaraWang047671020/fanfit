-- Saved team analyses and a usage log. Both are written and read only by the server with the secret key
-- (RLS on, no policies): results are derived from public data but runs cost Qloo quota and web searches, and the usage
-- log decides who may start another one.

-- A finished sponsor-finder run, stored as the events the UI replays (trimmed to the last bucket per kind and age).
create table public.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  team_key text not null,          -- lower(team name) | lower(city)
  team_name text not null,
  city text not null,
  events jsonb not null,
  ms integer,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create index analysis_runs_key on public.analysis_runs (team_key, created_at desc);

-- One row per costly action: a fresh team run, an activation idea, a sponsor/news check, an agent question.
create table public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users on delete cascade,
  kind text not null check (kind in ('run', 'activation', 'team_check', 'agent')),
  created_at timestamptz not null default now()
);
create index usage_events_recent on public.usage_events (kind, created_at desc);
create index usage_events_user on public.usage_events (user_id, kind, created_at desc);

alter table public.analysis_runs enable row level security;
alter table public.usage_events enable row level security;
revoke all on public.analysis_runs, public.usage_events from anon, authenticated;
