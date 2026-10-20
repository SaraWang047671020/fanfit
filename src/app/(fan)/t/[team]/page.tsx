import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient, currentUser } from "@/lib/supabase/server";
import { FollowButton } from "../../fans/FanButtons";
import FanOffers, { type FanOffer } from "../../FanOffers";

// fan_offers returns one row per live offer, or a single row with null offer fields when the team has none.
type Row = { team_name: string; team_city: string } & ({ offer_id: string } & Omit<FanOffer, "offer_id"> | { offer_id: null });

async function load(team: string) {
  if (!/^[0-9a-f-]{36}$/i.test(team)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("fan_offers", { p_team: team });
  const rows = (data ?? []) as Row[];
  return rows.length ? rows : null;
}

export async function generateMetadata({ params }: PageProps<"/t/[team]">): Promise<Metadata> {
  const rows = await load((await params).team);
  return { title: rows ? `${rows[0].team_name} fan offers · FanFit` : "FanFit" };
}

/** Public fan map for one team: partner businesses with offers fans can claim. No sign-in. */
export default async function FanMapPage({ params }: PageProps<"/t/[team]">) {
  const { team } = await params;
  const rows = await load(team);
  if (!rows) notFound();
  const { supabase, user, profile } = await currentUser();
  const following =
    profile?.role === "fan" && !!(await supabase.from("fan_follows").select("team_id").eq("team_id", team).maybeSingle()).data;
  const offers: FanOffer[] = rows.flatMap((r) =>
    r.offer_id === null
      ? []
      : [{ offer_id: r.offer_id, title: r.title, details: r.details, place_name: r.place_name, address: r.address, lat: r.lat, lon: r.lon, category: r.category, fit: r.fit, ends_on: r.ends_on }],
  );
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-gain">{rows[0].team_name} · fan offers</p>
        <FollowButton teamId={team} following={following} signedInAs={user ? (profile?.role ?? "none") : null} />
      </div>
      <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Deals from {rows[0].team_name} partners around {rows[0].team_city.split(",")[0]}</h1>
      <p className="mt-3 text-muted">Claim a code, show it at the counter. Businesses are partners picked for what this team&apos;s fans love.</p>
      <div className="mt-6">
        <FanOffers offers={offers} emptyText={`${rows[0].team_name} has no live offers right now. Check back soon.`} />
      </div>
      <p className="mt-10 text-xs text-muted">
        Powered by FanFit · <a href="/privacy" className="hover:text-text">Privacy</a> · <a href="/terms" className="hover:text-text">Terms</a>
      </p>
    </main>
  );
}
