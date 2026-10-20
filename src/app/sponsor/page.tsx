import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SPONSOR_CATEGORIES } from "@/lib/fanfit-score";
import { type DirectoryTeam, teamFit } from "@/lib/sponsor-fit";
import { currentUser } from "@/lib/supabase/server";
import AccountBar from "../AccountBar";
import TeamList, { type TeamRow } from "./TeamList";

export const metadata: Metadata = { title: "FanFit · Teams for your brand" };

interface SponsorRow {
  id: string;
  name: string;
  qloo_id: string | null;
  categories: string[];
}

export default async function SponsorPage() {
  const { supabase, user, profile } = await currentUser();
  if (!user) redirect("/login?next=/sponsor");
  if (profile?.role !== "sponsor") redirect(profile?.role === "team" ? "/fanfit" : "/onboarding");
  const { data: sponsor } = await supabase.from("sponsors").select("id, name, qloo_id, categories").eq("id", profile.sponsor_id!).single<SponsorRow>();
  if (!sponsor) redirect("/onboarding");

  const labels = SPONSOR_CATEGORIES.filter((c) => sponsor.categories.includes(c.key)).map((c) => c.label);
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <AccountBar name={profile.display_name ?? user.email ?? ""} org={sponsor.name} role="sponsor" tour="sponsor" />
      <header data-tour="ranking" className="mt-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-gain">FanFit for sponsors</p>
        <h1 className="mt-2 text-4xl font-bold">Teams whose fans already love {sponsor.name}.</h1>
        <p className="mt-3 max-w-3xl text-muted">
          Every team in the directory, ranked by how much more their fans like {sponsor.name} than the typical big brand (Qloo taste
          data). Your categories: {labels.join(", ") || "none set"}; teams that list a sponsor in them are marked taken.
        </p>
      </header>
      <div className="mt-8">
        {sponsor.qloo_id ? (
          <Suspense fallback={<p className="text-sm text-muted">Scoring every team with Qloo…</p>}>
            <Ranking sponsor={sponsor} />
          </Suspense>
        ) : (
          <p className="rounded-2xl border border-line bg-panel p-6 text-sm text-warn">
            {sponsor.name} is not linked to a Qloo brand, so there is no taste data to rank teams with yet.
          </p>
        )}
      </div>
    </main>
  );
}

async function Ranking({ sponsor }: { sponsor: SponsorRow }) {
  const { supabase } = await currentUser();
  const [{ data: teams }, { data: taken }] = await Promise.all([
    supabase.from("teams").select("id, name, league, city, qloo_id, fit_mean, fit_sd, claimed_at").returns<DirectoryTeam[]>(),
    supabase.from("team_sponsors").select("team_id, name, category").returns<{ team_id: string; name: string; category: string }[]>(),
  ]);
  const covered = new Set<string>(SPONSOR_CATEGORIES.filter((c) => sponsor.categories.includes(c.key)).flatMap((c) => c.covers));
  const listed = new Set((taken ?? []).map((t) => t.team_id));
  const fits = await teamFit(sponsor.qloo_id!, teams ?? []);
  const rows: TeamRow[] = fits.map(({ team, z }) => {
    const conflicts = (taken ?? []).filter((t) => t.team_id === team.id && covered.has(t.category)).map((t) => t.name);
    return {
      id: team.id,
      name: team.name,
      league: team.league,
      city: team.city,
      z,
      onFanfit: !!team.claimed_at,
      // "unknown": the club has not listed its sponsors on FanFit, so exclusivity cannot be checked.
      category: conflicts.length ? { status: "taken", by: conflicts } : listed.has(team.id) ? { status: "open" } : { status: "unknown" },
    };
  });
  return <TeamList rows={rows} />;
}
