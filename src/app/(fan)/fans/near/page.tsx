import type { Metadata } from "next";
import { type Taste, matchPlaces } from "@/lib/fan-taste";
import { currentUser } from "@/lib/supabase/server";
import FanOffers, { type FanOffer } from "../../FanOffers";

export const metadata: Metadata = { title: "Deals near me · FanFit" };

/** Every live offer from every team; "Near me" sorts by distance in the browser, "For you" by the fan's tastes. */
export default async function NearPage() {
  const { supabase, user } = await currentUser();
  const [{ data }, { data: tasteRows }] = await Promise.all([
    supabase.rpc("fan_all_offers"),
    user ? supabase.from("fan_tastes").select("entity_id, name, kind") : Promise.resolve({ data: [] as Taste[] }),
  ]);
  let offers = (data ?? []) as FanOffer[];
  const matches = await matchPlaces((tasteRows ?? []) as Taste[], offers.map((o) => o.place_qloo_id).filter((x): x is string => !!x));
  offers = offers.map((o) => ({ ...o, match: o.place_qloo_id ? matches.get(o.place_qloo_id) : undefined }));
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
      <h1 className="text-3xl font-bold">Deals near me</h1>
      <p className="mt-2 text-muted">Offers from every team&apos;s partner businesses. Tap “Near me” to sort by distance.</p>
      <div className="mt-6">
        <FanOffers offers={offers} emptyText="No team has live deals yet. Check back soon." />
      </div>
    </main>
  );
}
