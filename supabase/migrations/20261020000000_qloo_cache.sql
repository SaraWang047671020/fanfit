-- Qloo responses shared by every server instance and deploy. The taste graph changes slowly and the hackathon key
-- allows 10,000 calls a month (a full team run is ~200-250), so a repeated run should not spend quota again.
-- Only the server reads and writes it, with the secret key: RLS is on with no policies, which keeps the table out of
-- the public API (a signed-in user must not be able to plant cached results).

create table public.qloo_cache (
  key text primary key,          -- request path + query string; the API key travels in a header, never here
  value jsonb not null,          -- response trimmed to the fields FanFit reads (src/lib/qloo-cache.ts)
  fetched_at timestamptz not null default now()
);

alter table public.qloo_cache enable row level security;
revoke all on public.qloo_cache from anon, authenticated;
