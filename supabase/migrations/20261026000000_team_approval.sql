-- Team accounts need approval. Anyone could pick any team at onboarding and then edit its sponsor list and fan map
-- offers. Now a new team account is pending until a FanFit admin or an approved member of that team approves it.
-- my_team() only answers for approved members, so every team policy (sponsor list, offers, keys, claims) follows.

alter table public.profiles add column team_approved boolean not null default false;
alter table public.profiles add column is_admin boolean not null default false; -- set by hand in SQL, never through the API

-- Team accounts that exist today were created by the project owner while testing.
update public.profiles set team_approved = true where role = 'team';

-- Users may update only display_name (column grant from the accounts migration); these two columns stay locked.

create or replace function public.my_team() returns uuid
language sql stable security definer set search_path = '' as $$
  select team_id from public.profiles where user_id = auth.uid() and team_approved
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where user_id = auth.uid()), false)
$$;

-- "On FanFit" for sponsors and fans means an approved member, so claimed_at moves from join_team to approval.
update public.teams t set claimed_at = null
where not exists (select 1 from public.profiles p where p.team_id = t.id and p.team_approved);

create or replace function public.join_team(p_team uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if (select role from public.profiles where user_id = auth.uid()) is not null then
    raise exception 'account type already chosen';
  end if;
  if not exists (select 1 from public.teams where id = p_team) then raise exception 'unknown team'; end if;
  update public.profiles set role = 'team', team_id = p_team, team_approved = false where user_id = auth.uid();
end;
$$;

-- A pending user withdraws the request and can pick again.
create function public.cancel_team_request() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set role = null, team_id = null
  where user_id = auth.uid() and role = 'team' and not team_approved;
end;
$$;

-- Pending requests the caller may decide: all of them for an admin, their own team's for an approved member.
create function public.team_requests()
returns table (user_id uuid, email text, display_name text, team_id uuid, team_name text, requested_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.user_id, u.email::text, p.display_name, t.id, t.name, u.created_at
  from public.profiles p
  join auth.users u on u.id = p.user_id
  join public.teams t on t.id = p.team_id
  where p.role = 'team' and not p.team_approved
    and (public.is_admin() or p.team_id = public.my_team())
  order by u.created_at
$$;

-- Approve or reject a pending request. Rejecting resets the account so the person can choose again.
create function public.decide_team_request(p_user uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_team uuid;
begin
  select team_id into v_team from public.profiles where user_id = p_user and role = 'team' and not team_approved;
  if v_team is null then raise exception 'no pending request'; end if;
  -- coalesce: for a caller without an approved team, v_team = my_team() is null, and "not null" would let them through.
  if not coalesce(public.is_admin() or v_team = public.my_team(), false) then raise exception 'not allowed'; end if;
  if p_approve then
    update public.profiles set team_approved = true where user_id = p_user;
    update public.teams set claimed_at = coalesce(claimed_at, now()) where id = v_team;
  else
    update public.profiles set role = null, team_id = null where user_id = p_user;
  end if;
end;
$$;

-- Approved members of the caller's team, for the members page.
create function public.team_members()
returns table (user_id uuid, email text, display_name text, joined_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.user_id, u.email::text, p.display_name, p.created_at
  from public.profiles p join auth.users u on u.id = p.user_id
  where p.team_id = public.my_team() and p.team_approved
  order by p.created_at
$$;

revoke execute on function public.is_admin(), public.cancel_team_request(), public.team_requests(),
  public.decide_team_request(uuid, boolean), public.team_members() from public, anon;
grant execute on function public.is_admin(), public.cancel_team_request(), public.team_requests(),
  public.decide_team_request(uuid, boolean), public.team_members() to authenticated;
-- my_team was recreated: keep it away from anon as before.
revoke execute on function public.my_team() from public, anon;
grant execute on function public.my_team() to authenticated;
