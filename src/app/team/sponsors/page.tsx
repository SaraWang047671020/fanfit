import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import AccountBar from "../../AccountBar";
import SponsorList, { type ListedSponsor } from "./SponsorList";
import PageHeader from "../../PageHeader";

export const metadata: Metadata = { title: "FanFit · Your sponsors" };

export default async function TeamSponsorsPage() {
  const { supabase, user, profile } = await currentUser();
  if (!user) redirect("/login?next=/team/sponsors");
  if (profile?.role !== "team") redirect(profile?.role === "sponsor" ? "/sponsor" : profile?.role === "fan" ? "/fans" : "/onboarding");
  if (!profile.team_approved) redirect("/fanfit"); // pending: the fanfit page explains

  const [{ data: team }, { data: sponsors }] = await Promise.all([
    supabase.from("teams").select("name").eq("id", profile.team_id!).single<{ name: string }>(),
    supabase
      .from("team_sponsors")
      .select("id, name, category, tier, source_url, address, lat")
      .eq("team_id", profile.team_id!)
      .order("category")
      .order("name")
      .returns<ListedSponsor[]>(),
  ]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <AccountBar name={profile.display_name ?? user.email ?? ""} org={team?.name ?? "Your team"} role="team" />
      <PageHeader side="team" icon="handshake" eyebrow={<>Your sponsors</>} title={<>Current sponsors of {team?.name}</>}>
        <p className="mt-3 max-w-3xl text-muted">
          Keep this list current and FanFit uses it instead of web search: the sponsor finder sets aside brands that clash with a category
          you have sold, and brands looking at {team?.name} see which categories are taken. Every sponsor here also shows on your public fan
          map (set a location to give it a pin), so only add deals that are public.
        </p>
      </PageHeader>
      <div className="mt-8">
        <SponsorList sponsors={sponsors ?? []} />
      </div>
    </main>
  );
}
