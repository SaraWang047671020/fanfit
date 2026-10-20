-- Demo offers: shown on the public fan map with a clear DEMO label, for offers a business has not actually agreed to
-- (demos, judging). Their claims count as demo data on the team dashboard, like simulated claims.
-- Every offer created before this flag existed was a test, so all of them become demo offers.

alter table public.offers add column demo boolean not null default false;
update public.offers set demo = true;

-- The fan functions now return the flag. Their result columns change, so they are dropped and recreated.
drop function public.fan_offers(uuid);
create function public.fan_offers(p_team uuid)
returns table (team_name text, team_city text, offer_id uuid, title text, details text, place_name text, address text,
               lat double precision, lon double precision, category text, fit real, ends_on date, demo boolean)
language sql stable security definer set search_path = '' as $$
  select t.name, t.city, o.id, o.title, o.details, o.place_name, o.address, o.lat, o.lon, o.category, o.fit, o.ends_on, o.demo
  from public.teams t
  left join public.offers o on o.team_id = t.id and o.active and (o.ends_on is null or o.ends_on >= current_date)
  where t.id = p_team
  order by o.demo, o.fit desc nulls last
$$;

drop function public.fan_all_offers();
create function public.fan_all_offers()
returns table (offer_id uuid, title text, details text, place_name text, address text, lat double precision,
               lon double precision, category text, fit real, ends_on date, team_id uuid, team_name text, demo boolean)
language sql stable security definer set search_path = '' as $$
  select o.id, o.title, o.details, o.place_name, o.address, o.lat, o.lon, o.category, o.fit, o.ends_on, t.id, t.name, o.demo
  from public.offers o join public.teams t on t.id = o.team_id
  where o.active and (o.ends_on is null or o.ends_on >= current_date)
  order by o.demo, o.fit desc nulls last
$$;

drop function public.my_claims();
create function public.my_claims()
returns table (offer_id uuid, code text, claimed_at timestamptz, redeemed_at timestamptz, title text, place_name text,
               address text, ends_on date, active boolean, team_id uuid, team_name text, demo boolean)
language sql stable security definer set search_path = '' as $$
  select c.offer_id, c.code, c.claimed_at, c.redeemed_at, o.title, o.place_name, o.address, o.ends_on, o.active, t.id, t.name, o.demo
  from public.claims c
  join public.offers o on o.id = c.offer_id
  join public.teams t on t.id = o.team_id
  where c.user_id = auth.uid() and not c.simulated
  order by c.redeemed_at is not null, c.claimed_at desc
$$;

revoke execute on function public.fan_offers(uuid), public.fan_all_offers(), public.my_claims() from public, anon;
grant execute on function public.fan_offers(uuid), public.fan_all_offers() to anon, authenticated;
grant execute on function public.my_claims() to authenticated;
