-- Fan lists also return each place's Qloo id, so a fan's deals and partners can be ordered by their tastes.

drop function public.fan_all_offers();
create function public.fan_all_offers()
returns table (offer_id uuid, title text, details text, place_name text, address text, lat double precision,
               lon double precision, category text, fit real, ends_on date, team_id uuid, team_name text, demo boolean,
               place_qloo_id text)
language sql stable security definer set search_path = '' as $$
  select o.id, o.title, o.details, o.place_name, o.address, o.lat, o.lon, o.category, o.fit, o.ends_on, t.id, t.name, o.demo,
         o.place_qloo_id
  from public.offers o join public.teams t on t.id = o.team_id
  where o.active and (o.ends_on is null or o.ends_on >= current_date)
  order by o.demo, o.fit desc nulls last
$$;

drop function public.fan_partners(uuid);
create function public.fan_partners(p_team uuid)
returns table (name text, category text, tier text, source_url text, address text, lat double precision, lon double precision,
               place_qloo_id text)
language sql stable security definer set search_path = '' as $$
  select s.name, s.category, s.tier, s.source_url, s.address, s.lat, s.lon, s.place_qloo_id
  from public.team_sponsors s
  where s.team_id = p_team
  order by s.lat is null, s.name
$$;

revoke execute on function public.fan_all_offers(), public.fan_partners(uuid) from public, anon;
grant execute on function public.fan_all_offers(), public.fan_partners(uuid) to anon, authenticated;
