import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import AccountBar from "../AccountBar";
import AskConsole from "./AskConsole";

export const metadata: Metadata = { title: "FanFit · Ask FanFit" };

export default async function AskPage({ searchParams }: PageProps<"/ask">) {
  const { q } = await searchParams;
  const { supabase, user, profile } = await currentUser();
  if (!user) redirect("/login?next=/ask");
  const isTeam = profile?.role === "team" && profile.team_approved;
  if (!(isTeam || profile?.role === "sponsor")) redirect(profile?.role === "team" ? "/fanfit" : profile?.role === "fan" ? "/fans" : "/onboarding");

  const org = isTeam
    ? (await supabase.from("teams").select("name").eq("id", profile!.team_id!).single<{ name: string }>()).data?.name ?? "Your team"
    : (await supabase.from("sponsors").select("name").eq("id", profile!.sponsor_id!).single<{ name: string }>()).data?.name ?? "Your brand";
  const examples = isTeam
    ? [
        "Which banks would fit our fans best, and do any clash with our current sponsors?",
        "Find three local businesses for a matchday deal aimed at our biggest age group.",
        `Would Gatorade be a good fit for ${org}, compared with other teams?`,
      ]
    : [
        "Find three NBA teams whose fans love us and whose category is still open.",
        "Which teams in the Southeast (GA, FL, NC, TN) fit us best, and why?",
        "Compare the top two MLS teams for us: who are their fans and what do they share with our customers?",
      ];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <AccountBar name={profile!.display_name ?? user.email ?? ""} org={org} role={isTeam ? "team" : "sponsor"} />
      <header className="mt-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-gain">Ask FanFit</p>
        <h1 className="mt-2 text-4xl font-bold">Give the agent a goal</h1>
        <p className="mt-3 max-w-3xl text-muted">
          The agent plans, calls FanFit&apos;s Qloo tools (fit rankings, fan profiles, shared tastes, sponsor checks, news) and answers
          with picks it can back up. It can only name teams, brands and places a tool returned; every step is shown.
        </p>
      </header>
      <div className="mt-8">
        <AskConsole examples={examples} role={isTeam ? "team" : "sponsor"} initialQuestion={typeof q === "string" ? q.slice(0, 500) : undefined} />
      </div>
    </main>
  );
}
