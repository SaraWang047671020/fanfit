-- Accounts: every user is either a team account or a sponsor account, and belongs to one team or one sponsor.
-- Teams are pre-seeded (supabase/seed.sql) so sponsors can browse all of them before any club signs up;
-- a team account "claims" its row. Sponsors create their own row during onboarding.

create type public.account_role as enum ('team', 'sponsor');

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  league text not null,
  city text not null,            -- "Seattle, WA": the Qloo location signal FanFit uses
  qloo_id text not null unique,  -- Qloo brand entity for the team
  -- Mean and spread of this team's affinity over a fixed panel of 40 brands (brand as the Qloo signal). Sponsor-side
  -- fit is a z-score against these: raw affinities run high for some teams (Pelicans) and low for thin-data teams.
  fit_mean real not null,
  fit_sd real not null,
  claimed_at timestamptz,        -- first time a team account joined; shown to sponsors as "on FanFit"
  created_at timestamptz not null default now()
);

create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  qloo_id text,                  -- Qloo brand entity, when the brand is in Qloo
  categories text[] not null default '{}',  -- SPONSOR_CATEGORIES keys (web/src/lib/fanfit-score.ts)
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users on delete cascade,
  display_name text,
  role public.account_role,      -- null until onboarding is finished
  team_id uuid references public.teams on delete set null,
  sponsor_id uuid references public.sponsors on delete set null,
  created_at timestamptz not null default now(),
  constraint one_org check (
    (role is null and team_id is null and sponsor_id is null)
    or (role = 'team' and team_id is not null and sponsor_id is null)
    or (role = 'sponsor' and sponsor_id is not null and team_id is null)
  )
);

-- A team's current sponsors, entered or confirmed by the club. Replaces the web-search list as the source of truth
-- for exclusivity once a club maintains it; sponsors read it to see which categories are taken.
create table public.team_sponsors (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  name text not null,
  category text not null,        -- CATEGORIES keys (web/src/lib/fanfit-score.ts)
  source_url text,
  added_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  unique (team_id, name)
);

create index team_sponsors_team on public.team_sponsors (team_id);

-- ---------------------------------------------------------------- helpers

-- security definer so policies can read the caller's profile without recursing through profiles' own policy.
create function public.my_team() returns uuid
language sql stable security definer set search_path = '' as $$
  select team_id from public.profiles where user_id = auth.uid()
$$;

create function public.my_sponsor() returns uuid
language sql stable security definer set search_path = '' as $$
  select sponsor_id from public.profiles where user_id = auth.uid()
$$;

-- Every new auth user gets an empty profile; the name comes from Google or the email address.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- onboarding (the only way to set role / org)

create function public.join_team(p_team uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if (select role from public.profiles where user_id = auth.uid()) is not null then
    raise exception 'account type already chosen';
  end if;
  update public.teams set claimed_at = coalesce(claimed_at, now()) where id = p_team;
  if not found then raise exception 'unknown team'; end if;
  update public.profiles set role = 'team', team_id = p_team where user_id = auth.uid();
end;
$$;

create function public.create_sponsor(p_name text, p_qloo_id text, p_categories text[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if (select role from public.profiles where user_id = auth.uid()) is not null then
    raise exception 'account type already chosen';
  end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'brand name required'; end if;
  insert into public.sponsors (name, qloo_id, categories)
  values (trim(p_name), nullif(p_qloo_id, ''), coalesce(p_categories, '{}'))
  returning id into v_id;
  update public.profiles set role = 'sponsor', sponsor_id = v_id where user_id = auth.uid();
  return v_id;
end;
$$;

revoke execute on function public.join_team(uuid), public.create_sponsor(text, text, text[]) from public, anon;
grant execute on function public.join_team(uuid), public.create_sponsor(text, text, text[]) to authenticated;

-- ---------------------------------------------------------------- row level security

alter table public.teams enable row level security;
alter table public.sponsors enable row level security;
alter table public.profiles enable row level security;
alter table public.team_sponsors enable row level security;

-- All signed-in users see the team directory (sponsors browse every team).
create policy "teams readable by signed-in users" on public.teams
  for select to authenticated using (true);

create policy "own profile" on public.profiles
  for select to authenticated using (user_id = auth.uid());
create policy "edit own display name" on public.profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Role and org columns change only through join_team / create_sponsor.
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy "members read their sponsor" on public.sponsors
  for select to authenticated using (id = public.my_sponsor());
create policy "members edit their sponsor" on public.sponsors
  for update to authenticated using (id = public.my_sponsor()) with check (id = public.my_sponsor());

-- Signed-in users read every team's sponsor list (sponsors need it to see taken categories);
-- only that team's members change it.
create policy "team sponsors readable" on public.team_sponsors
  for select to authenticated using (true);
create policy "team members add sponsors" on public.team_sponsors
  for insert to authenticated with check (team_id = public.my_team());
create policy "team members edit sponsors" on public.team_sponsors
  for update to authenticated using (team_id = public.my_team()) with check (team_id = public.my_team());
create policy "team members remove sponsors" on public.team_sponsors
  for delete to authenticated using (team_id = public.my_team());
