-- The fan side is open to every signed-in account: club and brand staff are fans too. Following teams no longer
-- requires the 'fan' account type (tastes and coupons never did). Each row still belongs to its own user only.
drop policy "fans follow teams" on public.fan_follows;
create policy "fans follow teams" on public.fan_follows for insert to authenticated with check (user_id = auth.uid());
