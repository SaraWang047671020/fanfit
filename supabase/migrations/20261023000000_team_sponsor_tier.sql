-- Sponsorship tier as the club describes it ("jersey", "official beer partner"), shown next to the name.
alter table public.team_sponsors add column tier text not null default '' check (char_length(tier) <= 80);
