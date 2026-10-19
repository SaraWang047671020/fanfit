-- Closed loop, minimal version: a team puts an offer from a partner business on a public fan map, fans claim a code,
-- staff redeem it, and the team sees claims and redemptions next to the fit FanFit predicted.
-- Fans never touch these tables directly: they go through fan_offers / claim_offer / redeem_claim (security definer),
-- so the public API exposes no offer secrets and no claim rows.

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  place_qloo_id text not null,
  place_name text not null,
  address text not null default '',
  lat double precision,
  lon double precision,
  category text not null default '',
  title text not null check (char_length(title) between 3 and 80),
  details text not null default '' check (char_length(details) <= 300),
  fit real,                      -- FanFit fit (0-100) when the offer was created, compared with redemptions later
  ends_on date,
  active boolean not null default true,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create index offers_team on public.offers (team_id);

-- Secret in the business's redemption link. Separate table so offer rows can be shown without it.
create table public.offer_keys (
  offer_id uuid primary key references public.offers on delete cascade,
  redeem_key text not null default encode(extensions.gen_random_bytes(12), 'hex')
);

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers on delete cascade,
  code text not null,
  age_group text check (age_group in ('24_and_younger', '25_to_29', '30_to_34', '35_to_44', '45_to_54', '55_and_older')),
  claimed_at timestamptz not null default now(),
  redeemed_at timestamptz,
  simulated boolean not null default false, -- demo data from simulate_claims; never mixed silently with real claims
  unique (offer_id, code)
);
create index claims_offer on public.claims (offer_id);

create function public.create_offer_key() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.offer_keys (offer_id) values (new.id);
  return new;
end;
$$;
create trigger on_offer_created after insert on public.offers for each row execute function public.create_offer_key();

-- ---------------------------------------------------------------- team side (row level security)

alter table public.offers enable row level security;
alter table public.offer_keys enable row level security;
alter table public.claims enable row level security;

create policy "team reads own offers" on public.offers for select to authenticated using (team_id = public.my_team());
create policy "team adds own offers" on public.offers for insert to authenticated
  with check (team_id = public.my_team() and created_by = auth.uid());
create policy "team edits own offers" on public.offers for update to authenticated
  using (team_id = public.my_team()) with check (team_id = public.my_team());

create policy "team reads own offer keys" on public.offer_keys for select to authenticated
  using (exists (select 1 from public.offers o where o.id = offer_id and o.team_id = public.my_team()));

create policy "team reads own claims" on public.claims for select to authenticated
  using (exists (select 1 from public.offers o where o.id = offer_id and o.team_id = public.my_team()));

revoke all on public.offers, public.offer_keys, public.claims from anon;
revoke insert, update, delete on public.offer_keys, public.claims from authenticated;

-- ---------------------------------------------------------------- fan side (functions only)

-- The fan map for one team: team name/city plus its live offers. No secrets, no claim data.
create function public.fan_offers(p_team uuid)
returns table (team_name text, team_city text, offer_id uuid, title text, details text, place_name text, address text,
               lat double precision, lon double precision, category text, fit real, ends_on date)
language sql stable security definer set search_path = '' as $$
  select t.name, t.city, o.id, o.title, o.details, o.place_name, o.address, o.lat, o.lon, o.category, o.fit, o.ends_on
  from public.teams t
  left join public.offers o on o.team_id = t.id and o.active and (o.ends_on is null or o.ends_on >= current_date)
  where t.id = p_team
  order by o.fit desc nulls last
$$;

-- A fan claims a code for a live offer. Age group is optional and self-reported (for the team's dashboard).
create function public.claim_offer(p_offer uuid, p_age text default null) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_code text;
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0/O, 1/I/L: codes are read aloud at a counter
begin
  if not exists (select 1 from public.offers where id = p_offer and active and (ends_on is null or ends_on >= current_date)) then
    raise exception 'offer not available';
  end if;
  loop
    v_code := (select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '') from generate_series(1, 6));
    begin
      insert into public.claims (offer_id, code, age_group) values (p_offer, v_code, nullif(p_age, ''));
      return v_code;
    exception when unique_violation then
      -- rare collision: draw again
    end;
  end loop;
end;
$$;

-- Staff redeem a fan's code with the offer's secret key (from the redemption link). Returns ok / used / invalid / denied.
create function public.redeem_claim(p_offer uuid, p_key text, p_code text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_claim public.claims;
begin
  if not exists (select 1 from public.offer_keys where offer_id = p_offer and redeem_key = p_key) then return 'denied'; end if;
  select * into v_claim from public.claims where offer_id = p_offer and code = upper(trim(p_code)) and not simulated;
  if not found then return 'invalid'; end if;
  if v_claim.redeemed_at is not null then return 'used'; end if;
  update public.claims set redeemed_at = now() where id = v_claim.id;
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------- demo data (team members only)

-- Random claims and redemptions, flagged simulated. Deliberately unrelated to fit: simulated data must not look like
-- evidence that FanFit's predictions work.
create function public.simulate_claims(p_offer uuid, p_count int default 40) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
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

create function public.clear_simulated(p_team uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_team is distinct from public.my_team() then raise exception 'not your team'; end if;
  delete from public.claims c using public.offers o where c.offer_id = o.id and o.team_id = p_team and c.simulated;
end;
$$;

revoke execute on function public.fan_offers(uuid), public.claim_offer(uuid, text), public.redeem_claim(uuid, text, text),
  public.simulate_claims(uuid, int), public.clear_simulated(uuid) from public;
grant execute on function public.fan_offers(uuid), public.claim_offer(uuid, text), public.redeem_claim(uuid, text, text) to anon, authenticated;
grant execute on function public.simulate_claims(uuid, int), public.clear_simulated(uuid) to authenticated;
