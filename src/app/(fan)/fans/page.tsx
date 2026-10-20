import type { Metadata } from "next";
import Link from "next/link";
import { TASTE_TYPES, type Taste, type TasteKind, matchPlaces, suggestTastes } from "@/lib/fan-taste";
import { currentUser } from "@/lib/supabase/server";
import { Photo } from "../../Art";
import Tour from "../../Tour";
import FanOffers, { type FanOffer, type Partner } from "../FanOffers";
import TastePicker from "./TastePicker";
import TeamSearch, { type FanTeam } from "./TeamSearch";

export const metadata: Metadata = { title: "FanFit for fans · Deals from your team's partners" };

export default async function FansHome() {
  const { supabase, user } = await currentUser();
  // Every signed-in account gets the fan side (club and brand staff are fans too).
  const isFan = !!user;
  const [{ data: teams }, { data: follows }, { data: tasteRows }] = await Promise.all([
    supabase.rpc("fan_teams"),
    isFan ? supabase.from("fan_follows").select("team_id") : Promise.resolve({ data: [] as { team_id: string }[] }),
    isFan ? supabase.from("fan_tastes").select("entity_id, name, kind").order("created_at") : Promise.resolve({ data: [] as Taste[] }),
  ]);
  const tastes = (tasteRows ?? []) as Taste[];
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

  // Taste suggestions per kind: what fans of this fan's teams like (Qloo), or what is popular in the US.
  let suggestions = { brand: [], artist: [], movie: [], tv_show: [] } as Record<TasteKind, Taste[]>;
  if (isFan) {
    const { data: signal } = mine.length
      ? await supabase.from("teams").select("qloo_id, city").in("id", mine.map((t) => t.id))
      : { data: [] as { qloo_id: string; city: string }[] };
    const kinds = Object.keys(TASTE_TYPES) as TasteKind[];
    const lists = await Promise.all(kinds.map((k) => suggestTastes(k, signal ?? []).catch(() => [] as Taste[])));
    suggestions = Object.fromEntries(kinds.map((k, i) => [k, lists[i]])) as Record<TasteKind, Taste[]>;
  }
  const basis = mine.length ? `${mine.length === 1 ? mine[0].name : "your teams'"} fans` : "people in the US";

  // For you: order the map's deals and partner businesses by this fan's tastes (Qloo).
  const ids = [...offers.map((o) => o.place_qloo_id), ...partners.map((p) => p.place_qloo_id)].filter((x): x is string => !!x);
  const matches = await matchPlaces(tastes, ids);
  offers = offers.map((o) => ({ ...o, match: o.place_qloo_id ? matches.get(o.place_qloo_id) : undefined }));
  partners = partners.map((p) => ({ ...p, match: p.place_qloo_id ? matches.get(p.place_qloo_id) : undefined }));

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
      <header className="relative overflow-hidden rounded-3xl p-6 text-white sm:p-8">
        <Photo src="/images/crowd.jpg" tint="bg-gradient-to-r from-fan/90 via-fan/60 to-ink/30" opacity={1} priority />
        <div className="relative">
          <h1 className="text-3xl font-bold sm:text-4xl">Deals from your team&apos;s partners</h1>
          <p className="mt-2 max-w-xl text-white/90">
            Tap ♡ on your teams to see all their deals and partners on one map, then claim a code to use at the counter.
          </p>
        </div>
      </header>
      <div className="mt-6">
        {isFan ? (
          <TastePicker tastes={tastes} suggestions={suggestions} basis={basis} />
        ) : (
          <TastePreview signedInAs={null} />
        )}
      </div>
      {mine.length > 0 && (
        <section data-tour="my-map" className="mt-6">
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
      <Tour id="fans" auto aboveNav />
      <div className="mt-8">
        <TeamSearch teams={all} followed={[...followed]} signedInAs={user ? "fan" : null} />
      </div>
    </main>
  );
}

/**
 * What "Your taste" does, for visitors who cannot use it here: signed out (try the fan demo or sign in), a team or
 * sponsor account (tastes belong to fan accounts), or an account with no type yet. Otherwise the feature is invisible.
 */
function TastePreview({ signedInAs }: { signedInAs: string | null }) {
  return (
    <section className="rounded-2xl border border-dashed border-gain/50 bg-panel p-4">
      <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Your taste</h2>
      <p className="mt-1 text-sm">
        Pick brands, music, movies and shows you love, and Qloo orders your teams&apos; deals for you, with the reason: “because you
        like Patagonia”.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        {signedInAs === "team" || signedInAs === "sponsor" ? (
          <p className="text-xs text-muted">
            You are signed in with a {signedInAs} account; tastes belong to fan accounts. Sign out and use “Try the fan demo” to see it.
          </p>
        ) : signedInAs === "none" ? (
          <Link href="/fans/account" className="rounded-full bg-accent px-4 py-1.5 font-semibold text-white">
            Continue as a fan
          </Link>
        ) : (
          <>
            <form action="/auth/demo" method="post">
              <input type="hidden" name="as" value="fan" />
              <button className="rounded-full bg-gain px-4 py-1.5 font-semibold text-white">Try the fan demo</button>
            </form>
            <Link href="/login?next=/fans" className="text-accent">
              or sign in
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
