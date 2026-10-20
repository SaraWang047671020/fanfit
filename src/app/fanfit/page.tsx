import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import AccountBar from "../AccountBar";
import Pending from "../team/Pending";
import FanfitConsole from "./FanfitConsole";
import PageHeader from "../PageHeader";

export const metadata: Metadata = { title: "FanFit · Sponsor finder" };

export default async function FanfitPage() {
  const { supabase, user, profile } = await currentUser();
  if (!user) redirect("/login?next=/fanfit");
  if (profile?.role !== "team") redirect(profile?.role === "sponsor" ? "/sponsor" : "/onboarding");
  const { data: team } = await supabase
    .from("teams")
    .select("name, city")
    .eq("id", profile.team_id!)
    .single<{ name: string; city: string }>();
  if (!profile.team_approved) return <Pending name={profile.display_name ?? user.email ?? ""} team={team?.name ?? "your team"} />;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <AccountBar name={profile.display_name ?? user.email ?? ""} org={team?.name ?? "Your team"} role="team" tour="team-finder" />
      <PageHeader side="team" icon="radar" eyebrow={<>FanFit Agent</>} title={<>Find the sponsors your fans already love.</>}>
        <p className="mt-3 max-w-3xl text-muted">
          Enter a team. The agent estimates who its fans are, asks Qloo which brands and local businesses each age group loves, searches the
          web for a reason to call each brand now, and sets aside anyone who clashes with a current sponsor. Every brand comes from Qloo;
          every timing signal links to its source.
        </p>
      </PageHeader>
      <div className="mt-8">
        <FanfitConsole initial={team ? { team: team.name, city: team.city } : undefined} />
      </div>
    </main>
  );
}
