import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import AccountBar from "../AccountBar";
import Pending from "../team/Pending";
import FanfitConsole from "./FanfitConsole";

export const metadata: Metadata = { title: "FanFit · Sponsor finder" };

export default async function FanfitPage() {
  const { supabase, user, profile } = await currentUser();
  if (!user) redirect("/login?next=/fanfit");
  if (profile?.role !== "team") redirect(profile?.role === "sponsor" ? "/sponsor" : "/onboarding");
  const { data: team } = await supabase.from("teams").select("name, city").eq("id", profile.team_id!).single<{ name: string; city: string }>();
  if (!profile.team_approved) return <Pending name={profile.display_name ?? user.email ?? ""} team={team?.name ?? "your team"} />;
  const { data: requests } = await supabase.rpc("team_requests");

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <AccountBar name={profile.display_name ?? user.email ?? ""} org={team?.name ?? "Your team"} role="team" />
      <div className="mt-3 flex flex-wrap justify-end gap-4 text-sm">
        <Link href="/ask" className="font-semibold text-gain hover:underline">
          ✦ Ask FanFit →
        </Link>
        <Link href="/team/members" className="text-accent hover:underline">
          Team members{requests?.length ? ` (${requests.length} waiting)` : ""} →
        </Link>
        <Link href="/team/sponsors" className="text-accent hover:underline">
          Your sponsors list →
        </Link>
        <Link href="/team/offers" className="text-accent hover:underline">
          Fan map offers and results →
        </Link>
      </div>
      <header className="mt-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-gain">FanFit Agent</p>
        <h1 className="mt-2 text-4xl font-bold">Find the sponsors your fans already love.</h1>
        <p className="mt-3 max-w-3xl text-muted">
          Enter a team. The agent estimates who its fans are, asks Qloo which brands and local businesses each age group loves,
          searches the web for a reason to call each brand now, and sets aside anyone who clashes with a current sponsor. Every
          brand comes from Qloo; every timing signal links to its source.
        </p>
      </header>
      <div className="mt-8">
        <FanfitConsole initial={team ? { team: team.name, city: team.city } : undefined} />
      </div>
    </main>
  );
}
