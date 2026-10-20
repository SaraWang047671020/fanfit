-- A team's inbox of brand notes, with the brand's name and categories (teams cannot read the sponsors table).
create function public.team_interest()
returns table (id uuid, sponsor_name text, sponsor_categories text[], message text, contact_email text, target text,
               fit_z real, status text, demo boolean, created_at timestamptz, responded_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.id, s.name, s.categories, i.message, i.contact_email, i.target, i.fit_z, i.status, i.demo, i.created_at, i.responded_at
  from public.sponsor_interest i join public.sponsors s on s.id = i.sponsor_id
  where i.team_id = public.my_team() and (not i.demo or public.is_demo_user())
  order by i.status = 'new' desc, i.created_at desc
$$;
revoke execute on function public.team_interest() from public, anon;
grant execute on function public.team_interest() to authenticated;
