-- A fan's own tastes (Qloo brands, artists, movies, TV shows) used to order their deals "for you".
-- Private to the fan: nobody else reads them, not even their teams.

create table public.fan_tastes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entity_id text not null, -- Qloo entity id
  name text not null check (length(name) between 1 and 200),
  kind text not null check (kind in ('brand', 'artist', 'movie', 'tv_show')),
  created_at timestamptz not null default now(),
  primary key (user_id, entity_id)
);

alter table public.fan_tastes enable row level security;
create policy "fans read own tastes" on public.fan_tastes for select to authenticated using (user_id = auth.uid());
create policy "fans add own tastes" on public.fan_tastes for insert to authenticated
  with check (user_id = auth.uid() and (select count(*) from public.fan_tastes t where t.user_id = auth.uid()) < 8);
create policy "fans remove own tastes" on public.fan_tastes for delete to authenticated using (user_id = auth.uid());

revoke all on public.fan_tastes from anon;
grant select, insert, delete on public.fan_tastes to authenticated;
