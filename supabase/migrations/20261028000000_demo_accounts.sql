-- Shared demo accounts for judges and visitors ("Try as team / sponsor / fan" on the home page). Everyone signs in to
-- the same accounts, so they may explore and create, but not damage what the next visitor sees: no sponsor-list edits,
-- no member approvals, no wiping demo data, and offers they create are always demo offers.

alter table public.profiles add column is_demo boolean not null default false; -- set by the server, never by users

create function public.is_demo_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_demo from public.profiles where user_id = auth.uid()), false)
$$;
revoke execute on function public.is_demo_user() from public, anon;
grant execute on function public.is_demo_user() to authenticated;

-- Sponsor list: read-only for demo accounts.
drop policy "team members add sponsors" on public.team_sponsors;
drop policy "team members edit sponsors" on public.team_sponsors;
drop policy "team members remove sponsors" on public.team_sponsors;
create policy "team members add sponsors" on public.team_sponsors for insert to authenticated
  with check (team_id = public.my_team() and not public.is_demo_user());
create policy "team members edit sponsors" on public.team_sponsors for update to authenticated
  using (team_id = public.my_team() and not public.is_demo_user()) with check (team_id = public.my_team());
create policy "team members remove sponsors" on public.team_sponsors for delete to authenticated
  using (team_id = public.my_team() and not public.is_demo_user());

-- Offers: demo accounts change only the offers they created (the seeded demo offers stay put for everyone).
drop policy "team edits own offers" on public.offers;
create policy "team edits own offers" on public.offers for update to authenticated
  using (team_id = public.my_team() and (not public.is_demo_user() or created_by = auth.uid()))
  with check (team_id = public.my_team());

-- Offers created from a demo account are demo offers, whatever the form said.
create function public.force_demo_offer() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.is_demo_user() then new.demo := true; end if;
  return new;
end;
$$;
create trigger offers_force_demo before insert on public.offers for each row execute function public.force_demo_offer();
revoke execute on function public.force_demo_offer() from public, anon, authenticated;

-- Approvals and demo-data wipes are off for demo accounts.
create or replace function public.decide_team_request(p_user uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_team uuid;
begin
  if public.is_demo_user() then raise exception 'not available in the demo'; end if;
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

create or replace function public.clear_simulated(p_team uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if public.is_demo_user() then raise exception 'not available in the demo'; end if;
  if p_team is distinct from public.my_team() then raise exception 'not your team'; end if;
  delete from public.claims c using public.offers o where c.offer_id = o.id and o.team_id = p_team and c.simulated;
end;
$$;

create or replace function public.simulate_claims(p_offer uuid, p_count int default 40) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if public.is_demo_user() then raise exception 'not available in the demo'; end if;
  if not exists (select 1 from public.offers where id = p_offer and team_id = public.my_team()) then
    raise exception 'not your offer';
  end if;
  insert into public.claims (offer_id, code, age_group, claimed_at, redeemed_at, simulated)
  select p_offer,
         'SIM' || lpad(i::text, 5, '0') || substr(md5(random()::text), 1, 4),
         (array['24_and_younger', '25_to_29', '30_to_34', '35_to_44', '45_to_54', '55_and_older'])[1 + floor(random() * 6)::int],
         now() - random() * interval '21 days',
         case when random() < 0.5 then now() - random() * interval '14 days' end,
         true
  from generate_series(1, least(greatest(p_count, 1), 200)) i;
end;
$$;

-- Same grants as before (create or replace keeps them, restated for clarity).
revoke execute on function public.decide_team_request(uuid, boolean), public.clear_simulated(uuid), public.simulate_claims(uuid, int) from public, anon;
grant execute on function public.decide_team_request(uuid, boolean), public.clear_simulated(uuid), public.simulate_claims(uuid, int) to authenticated;
