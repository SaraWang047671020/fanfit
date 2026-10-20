import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import AccountBar from "../../AccountBar";
import SponsorList, { type ListedSponsor } from "./SponsorList";

export const metadata: Metadata = { title: "FanFit · Your sponsors" };

export default async function TeamSponsorsPage() {
  const { supabase, user, profile } = await currentUser();
  if (!user) redirect("/login?next=/team/sponsors");
  if (profile?.role !== "team") redirect(profile?.role === "sponsor" ? "/sponsor" : profile?.role === "fan" ? "/fans" : "/onboarding");

  const [{ data: team }, { data: sponsors }] = await Promise.all([
    supabase.from("teams").select("name").eq("id", profile.team_id!).single<{ name: string }>(),
    supabase
      .from("team_sponsors")
      .select("id, name, category, tier, source_url")
      .eq("team_id", profile.team_id!)
      .order("category")
      .order("name")
      .returns<ListedSponsor[]>(),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <AccountBar name={profile.display_name ?? user.email ?? ""} org={team?.name ?? "Your team"} role="team" />
      <header className="mt-6">
        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/fanfit" className="text-muted hover:text-text">← Sponsor finder</Link>
          <Link href="/team/offers" className="text-muted hover:text-text">Fan map offers</Link>
        </div>
        <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-gain">Your sponsors</p>
        <h1 className="mt-2 text-4xl font-bold">Current sponsors of {team?.name}</h1>
        <p className="mt-3 max-w-3xl text-muted">
          Keep this list current and FanFit uses it instead of web search: the sponsor finder sets aside brands that clash with a
          category you have sold, and brands looking at {team?.name} see which categories are taken. Sponsors can see this list, so
          only add deals that are public.
        </p>
      </header>
      <div className="mt-8">
        <SponsorList sponsors={sponsors ?? []} />
      </div>
    </main>
  );
}
