-- Pitch reports: "why our fans fit your brand" (team -> brand) and "why our brand fits your fans" (brand -> team).
-- A snapshot built by the server from FanFit's analysis, opened by anyone with its link (/r/<token>), no sign-in.
-- Team -> brand pitches are tracked in team_outreach; brand -> team notes (sponsor_interest) point to their report.

create table public.pitch_reports (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/=', '-_'),
  kind text not null check (kind in ('team_to_brand', 'brand_to_team')),
  team_id uuid not null references public.teams (id) on delete cascade,
  sponsor_id uuid references public.sponsors (id) on delete cascade, -- set when the brand side is a FanFit account
  brand_qloo_id text not null,
  brand_name text not null,
  body jsonb not null,
  demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  views int not null default 0,
  last_viewed_at timestamptz
);
alter table public.pitch_reports enable row level security;
-- Written by the server only (secret key). Authors' organisations can list theirs; the public reads by token below.
create policy "author org reads reports" on public.pitch_reports for select to authenticated
  using ((kind = 'team_to_brand' and team_id = public.my_team()) or (kind = 'brand_to_team' and sponsor_id = public.my_sponsor()));
revoke all on public.pitch_reports from anon, authenticated;
grant select on public.pitch_reports to authenticated;

-- The public report page. Counts a view unless the author is looking.
create function public.report_by_token(p_token text)
returns table (kind text, body jsonb, demo boolean, created_at timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.pitch_reports r set views = r.views + 1, last_viewed_at = now()
  where r.token = p_token and r.created_by is distinct from auth.uid();
  return query select r.kind, r.body, r.demo, r.created_at from public.pitch_reports r where r.token = p_token;
end;
$$;
revoke execute on function public.report_by_token(text) from public;
grant execute on function public.report_by_token(text) to anon, authenticated;

-- Team -> brand pitches. The brand may not be on FanFit; if a FanFit brand account has the same Qloo id, it sees
-- the pitch in its inbox and answers (status). Demo pitches reach demo accounts only.
create table public.team_outreach (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  brand_qloo_id text not null,
  brand_name text not null,
  message text not null default '' check (length(message) <= 600),
  report_id uuid references public.pitch_reports (id) on delete set null,
  status text not null default 'new' check (status in ('new', 'interested', 'declined')),
  demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (team_id, brand_qloo_id)
);
alter table public.team_outreach enable row level security;

create function public.my_sponsor_qloo() returns text
language sql stable security definer set search_path = '' as $$
  select s.qloo_id from public.sponsors s where s.id = public.my_sponsor()
$$;
revoke execute on function public.my_sponsor_qloo() from public, anon;
grant execute on function public.my_sponsor_qloo() to authenticated;

create policy "team reads its pitches" on public.team_outreach for select to authenticated using (team_id = public.my_team());
create policy "brand reads pitches to it" on public.team_outreach for select to authenticated
  using (brand_qloo_id = public.my_sponsor_qloo() and (not demo or public.is_demo_user()));
create policy "team withdraws its pitches" on public.team_outreach for delete to authenticated using (team_id = public.my_team());
create policy "brand answers pitches to it" on public.team_outreach for update to authenticated
  using (brand_qloo_id = public.my_sponsor_qloo() and (not demo or public.is_demo_user()))
  with check (brand_qloo_id = public.my_sponsor_qloo());
revoke all on public.team_outreach from anon, authenticated;
grant select, delete on public.team_outreach to authenticated;
grant update (status) on public.team_outreach to authenticated;

create function public.team_outreach_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then new.responded_at := now(); end if;
  return new;
end;
$$;
create trigger team_outreach_stamp before update on public.team_outreach for each row execute function public.team_outreach_stamp();
revoke execute on function public.team_outreach_stamp() from public, anon, authenticated;

-- A brand's inbox: pitches from teams to this brand, with the team and the report link.
create function public.brand_inbox()
returns table (id uuid, team_id uuid, team_name text, team_league text, team_city text, message text, report_token text,
               status text, demo boolean, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select o.id, t.id, t.name, t.league, t.city, o.message, r.token, o.status, o.demo, o.created_at
  from public.team_outreach o
  join public.teams t on t.id = o.team_id
  left join public.pitch_reports r on r.id = o.report_id
  where o.brand_qloo_id = public.my_sponsor_qloo() and (not o.demo or public.is_demo_user())
  order by o.status = 'new' desc, o.created_at desc
$$;
revoke execute on function public.brand_inbox() from public, anon;
grant execute on function public.brand_inbox() to authenticated;

-- Brand -> team notes link their report; the team inbox returns its token.
alter table public.sponsor_interest add column report_id uuid references public.pitch_reports (id) on delete set null;

drop function public.team_interest();
create function public.team_interest()
returns table (id uuid, sponsor_name text, sponsor_categories text[], message text, contact_email text, target text,
               fit_z real, status text, demo boolean, created_at timestamptz, responded_at timestamptz, report_token text)
language sql stable security definer set search_path = '' as $$
  select i.id, s.name, s.categories, i.message, i.contact_email, i.target, i.fit_z, i.status, i.demo, i.created_at, i.responded_at, r.token
  from public.sponsor_interest i
  join public.sponsors s on s.id = i.sponsor_id
  left join public.pitch_reports r on r.id = i.report_id
  where i.team_id = public.my_team() and (not i.demo or public.is_demo_user())
  order by i.status = 'new' desc, i.created_at desc
$$;
revoke execute on function public.team_interest() from public, anon;
grant execute on function public.team_interest() to authenticated;

-- Report generation spends Qloo, a web search and two model calls: its own daily limit.
alter table public.usage_events drop constraint usage_events_kind_check;
alter table public.usage_events add constraint usage_events_kind_check check (kind in ('run', 'activation', 'team_check', 'agent', 'report'));
