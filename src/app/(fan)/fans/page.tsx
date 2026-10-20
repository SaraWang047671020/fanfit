import type { Metadata } from "next";
import { currentUser } from "@/lib/supabase/server";
import TeamSearch, { type FanTeam } from "./TeamSearch";

export const metadata: Metadata = { title: "FanFit for fans · Deals from your team's partners" };

export default async function FansHome() {
  const { supabase, user, profile } = await currentUser();
  const [{ data: teams }, { data: follows }] = await Promise.all([
    supabase.rpc("fan_teams"),
    user && profile?.role === "fan" ? supabase.from("fan_follows").select("team_id") : Promise.resolve({ data: [] as { team_id: string }[] }),
  ]);
  const followed = new Set((follows ?? []).map((f) => f.team_id));
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
      <h1 className="text-3xl font-bold sm:text-4xl">Deals from your team&apos;s partners</h1>
      <p className="mt-2 text-muted">Pick your team to see local businesses that partner with it, and claim a code to use at the counter.</p>
      <div className="mt-6">
        <TeamSearch teams={(teams ?? []) as FanTeam[]} followed={[...followed]} />
      </div>
    </main>
  );
}
