import type { Metadata } from "next";
import { currentUser } from "@/lib/supabase/server";
import FanOffers, { type FanOffer, type Partner } from "../FanOffers";
import TeamSearch, { type FanTeam } from "./TeamSearch";

export const metadata: Metadata = { title: "FanFit for fans · Deals from your team's partners" };

export default async function FansHome() {
  const { supabase, user, profile } = await currentUser();
  const isFan = !!user && profile?.role === "fan";
  const [{ data: teams }, { data: follows }] = await Promise.all([
    supabase.rpc("fan_teams"),
    isFan ? supabase.from("fan_follows").select("team_id") : Promise.resolve({ data: [] as { team_id: string }[] }),
  ]);
  const all = (teams ?? []) as FanTeam[];
  const followed = new Set((follows ?? []).map((f) => f.team_id));
  const mine = all.filter((t) => followed.has(t.id));

  // One map for every favorite team: their live deals and their official partners.
  let offers: FanOffer[] = [];
  let partners: Partner[] = [];
  if (mine.length) {
    const [{ data: live }, ...lists] = await Promise.all([
      supabase.rpc("fan_all_offers"),
      ...mine.map((t) => supabase.rpc("fan_partners", { p_team: t.id })),
    ]);
    offers = ((live ?? []) as FanOffer[]).filter((o) => o.team_id && followed.has(o.team_id));
    partners = lists.flatMap(({ data }, i) => ((data ?? []) as Partner[]).map((p) => ({ ...p, team_id: mine[i].id, team_name: mine[i].name })));
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
      <h1 className="text-3xl font-bold sm:text-4xl">Deals from your team&apos;s partners</h1>
      <p className="mt-2 text-muted">
        Tap ♡ on your teams to see all their deals and partners on one map, then claim a code to use at the counter.
      </p>
      {mine.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-accent">
            My teams&apos; map · {mine.map((t) => t.name).join(", ")}
          </h2>
          <div className="mt-3">
            <FanOffers
              offers={offers}
              partners={partners}
              teams={mine.map((t) => ({ id: t.id, name: t.name }))}
              emptyText="Your teams have no deals or listed partners yet. Check back soon."
            />
          </div>
        </section>
      )}
      <div className="mt-8">
        <TeamSearch teams={all} followed={[...followed]} signedInAs={user ? (profile?.role ?? "none") : null} />
      </div>
    </main>
  );
}
