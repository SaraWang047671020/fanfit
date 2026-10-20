import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import FanOffers, { type FanOffer } from "../../FanOffers";

export const metadata: Metadata = { title: "Deals near me · FanFit" };

/** Every live offer from every team; "Near me" sorts by distance in the browser. */
export default async function NearPage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("fan_all_offers");
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
      <h1 className="text-3xl font-bold">Deals near me</h1>
      <p className="mt-2 text-muted">Offers from every team&apos;s partner businesses. Tap “Near me” to sort by distance.</p>
      <div className="mt-6">
        <FanOffers offers={(data ?? []) as FanOffer[]} emptyText="No team has live deals yet. Check back soon." />
      </div>
    </main>
  );
}
