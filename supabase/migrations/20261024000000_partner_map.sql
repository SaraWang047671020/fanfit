-- Every sponsor on a club's list appears on its public fan map, not only businesses with an offer. Sponsors with a
-- physical location (picked by the club from Qloo places) get a pin; national brands are listed without one.

alter table public.team_sponsors
  add column place_qloo_id text,
  add column address text not null default '',
  add column lat double precision,
  add column lon double precision;

-- The club's partners for the fan map (public: the list is meant to be public, and sponsors can already read it).
create function public.fan_partners(p_team uuid)
returns table (name text, category text, tier text, source_url text, address text, lat double precision, lon double precision)
language sql stable security definer set search_path = '' as $$
  select s.name, s.category, s.tier, s.source_url, s.address, s.lat, s.lon
  from public.team_sponsors s
  where s.team_id = p_team
  order by s.lat is null, s.name
$$;

revoke execute on function public.fan_partners(uuid) from public;
grant execute on function public.fan_partners(uuid) to anon, authenticated;
