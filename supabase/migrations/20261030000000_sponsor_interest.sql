-- A brand tells a team it would like to talk: the two sides of FanFit meet. One open note per brand and team.
-- The brand writes the note; the team only answers (status). FanFit's fit score is filled in by the server.
-- Notes from demo accounts are demo notes: only demo accounts see them, so visitors never reach a real team's inbox.

create table public.sponsor_interest (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.sponsors (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  message text not null default '' check (length(message) <= 600),
  contact_email text check (contact_email is null or length(contact_email) <= 200),
  target text check (target is null or length(target) <= 120), -- the audience the brand was ranking for, if any
  fit_z real,                                                -- FanFit fit when sent (set by the server)
  status text not null default 'new' check (status in ('new', 'interested', 'declined')),
  demo boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (sponsor_id, team_id)
);

alter table public.sponsor_interest enable row level security;

create policy "brand and team read their notes" on public.sponsor_interest for select to authenticated
  using (sponsor_id = public.my_sponsor()
         or (team_id = public.my_team() and (not demo or public.is_demo_user())));
create policy "brand sends notes" on public.sponsor_interest for insert to authenticated
  with check (sponsor_id = public.my_sponsor() and created_by = auth.uid());
create policy "brand withdraws notes" on public.sponsor_interest for delete to authenticated
  using (sponsor_id = public.my_sponsor());
create policy "team answers notes" on public.sponsor_interest for update to authenticated
  using (team_id = public.my_team() and (not demo or public.is_demo_user()))
  with check (team_id = public.my_team());

-- Column grants: brands write the note, teams only the status; fit_z, demo and timestamps are the server's.
revoke all on public.sponsor_interest from anon, authenticated;
grant select, delete on public.sponsor_interest to authenticated;
grant insert (sponsor_id, team_id, message, contact_email, target, created_by) on public.sponsor_interest to authenticated;
grant update (status) on public.sponsor_interest to authenticated;

create function public.sponsor_interest_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.demo := public.is_demo_user();
  elsif new.status is distinct from old.status then
    new.responded_at := now();
  end if;
  return new;
end;
$$;
create trigger sponsor_interest_stamp before insert or update on public.sponsor_interest
  for each row execute function public.sponsor_interest_stamp();
revoke execute on function public.sponsor_interest_stamp() from public, anon, authenticated;
