-- Fan side: fan accounts that follow teams and keep their claimed codes across devices, plus the public functions the
-- fan home page uses. Fans without an account keep working exactly as before (codes saved in the browser).
-- Teams see claim counts, never which fan claimed or the codes themselves (column privileges below).

-- ---------------------------------------------------------------- fan accounts

alter table public.profiles drop constraint one_org;
alter table public.profiles add constraint one_org check (
  (role is null and team_id is null and sponsor_id is null)
  or (role = 'team' and team_id is not null and sponsor_id is null)
  or (role = 'sponsor' and sponsor_id is not null and team_id is null)
  or (role = 'fan' and team_id is null and sponsor_id is null)
);

create function public.join_fan() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if (select role from public.profiles where user_id = auth.uid()) is not null then
    raise exception 'account type already chosen';
  end if;
  update public.profiles set role = 'fan' where user_id = auth.uid();
end;
$$;

create table public.fan_follows (
  user_id uuid not null references auth.users on delete cascade,
  team_id uuid not null references public.teams on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, team_id)
);
alter table public.fan_follows enable row level security;
create policy "fans read own follows" on public.fan_follows for select to authenticated using (user_id = auth.uid());
create policy "fans follow teams" on public.fan_follows for insert to authenticated
  with check (user_id = auth.uid() and (select role from public.profiles where user_id = auth.uid()) = 'fan');
create policy "fans unfollow teams" on public.fan_follows for delete to authenticated using (user_id = auth.uid());
revoke all on public.fan_follows from anon;

-- ---------------------------------------------------------------- claims owned by fan accounts

alter table public.claims add column user_id uuid references auth.users on delete set null;
create index claims_user on public.claims (user_id);

-- Teams read claim rows for their dashboard, but not who claimed or the code (a team could otherwise redeem codes or
-- tie claims to fan accounts). Fans read their own claims through my_claims().
revoke select on public.claims from authenticated;
grant select (id, offer_id, age_group, claimed_at, redeemed_at, simulated) on public.claims to authenticated;

-- claim_offer now records the signed-in fan (null for anonymous claims) and gives a signed-in fan their existing
-- unused code instead of a second one.
create or replace function public.claim_offer(p_offer uuid, p_age text default null) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_code text;
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0/O, 1/I/L: codes are read aloud at a counter
begin
  if not exists (select 1 from public.offers where id = p_offer and active and (ends_on is null or ends_on >= current_date)) then
    raise exception 'offer not available';
  end if;
  if auth.uid() is not null then
    select code into v_code from public.claims
    where offer_id = p_offer and user_id = auth.uid() and redeemed_at is null and not simulated limit 1;
    if v_code is not null then return v_code; end if;
  end if;
  loop
    v_code := (select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '') from generate_series(1, 6));
    begin
      insert into public.claims (offer_id, code, age_group, user_id) values (p_offer, v_code, nullif(p_age, ''), auth.uid());
      return v_code;
    exception when unique_violation then
      -- rare collision: draw again
    end;
  end loop;
end;
$$;

-- A signed-in fan takes over codes claimed on this device before signing in (only codes nobody owns yet).
create function public.attach_claims(p_items jsonb) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_count int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update public.claims c set user_id = auth.uid()
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as i(offer uuid, code text)
  where c.offer_id = i.offer and c.code = upper(i.code) and c.user_id is null and not c.simulated;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- The signed-in fan's codes with what they are for.
create function public.my_claims()
returns table (offer_id uuid, code text, claimed_at timestamptz, redeemed_at timestamptz, title text, place_name text,
               address text, ends_on date, active boolean, team_id uuid, team_name text)
language sql stable security definer set search_path = '' as $$
  select c.offer_id, c.code, c.claimed_at, c.redeemed_at, o.title, o.place_name, o.address, o.ends_on, o.active, t.id, t.name
  from public.claims c
  join public.offers o on o.id = c.offer_id
  join public.teams t on t.id = o.team_id
  where c.user_id = auth.uid() and not c.simulated
  order by c.redeemed_at is not null, c.claimed_at desc
$$;

-- Status of a code saved on a device without an account: unused / used / unknown. Knowing the code is the proof.
create function public.claim_status(p_offer uuid, p_code text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select case when redeemed_at is null then 'unused' else 'used' end
     from public.claims where offer_id = p_offer and code = upper(p_code) and not simulated),
    'unknown')
$$;

-- ---------------------------------------------------------------- fan home page (public)

-- Every team with its number of live offers, for search and "teams with deals".
create function public.fan_teams()
returns table (id uuid, name text, league text, city text, live_offers int)
language sql stable security definer set search_path = '' as $$
  select t.id, t.name, t.league, t.city,
         (select count(*)::int from public.offers o where o.team_id = t.id and o.active and (o.ends_on is null or o.ends_on >= current_date))
  from public.teams t
  order by 5 desc, t.name
$$;

-- All live offers across teams, for "deals near me" (sorted by distance in the browser; the location never leaves it).
create function public.fan_all_offers()
returns table (offer_id uuid, title text, details text, place_name text, address text, lat double precision,
               lon double precision, category text, fit real, ends_on date, team_id uuid, team_name text)
language sql stable security definer set search_path = '' as $$
  select o.id, o.title, o.details, o.place_name, o.address, o.lat, o.lon, o.category, o.fit, o.ends_on, t.id, t.name
  from public.offers o join public.teams t on t.id = o.team_id
  where o.active and (o.ends_on is null or o.ends_on >= current_date)
  order by o.fit desc nulls last
$$;

revoke execute on function public.join_fan(), public.attach_claims(jsonb), public.my_claims(), public.claim_status(uuid, text),
  public.fan_teams(), public.fan_all_offers() from public;
grant execute on function public.claim_status(uuid, text), public.fan_teams(), public.fan_all_offers() to anon, authenticated;
grant execute on function public.join_fan(), public.attach_claims(jsonb), public.my_claims() to authenticated;
