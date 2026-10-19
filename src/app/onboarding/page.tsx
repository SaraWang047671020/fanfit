import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import OnboardingForm, { type TeamOption } from "./OnboardingForm";

export const metadata: Metadata = { title: "FanFit · Set up your account" };

export default async function OnboardingPage() {
  const { supabase, user, profile } = await currentUser();
  if (!user) redirect("/login?next=/onboarding");
  if (profile?.role === "team") redirect("/fanfit");
  if (profile?.role === "sponsor") redirect("/sponsor");

  const { data: teams } = await supabase.from("teams").select("id, name, league, city").order("league").order("name").returns<TeamOption[]>();
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-16">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-gain">FanFit</p>
      <h1 className="mt-2 text-3xl font-bold">Who are you signing in for?</h1>
      <p className="mt-3 text-muted">Pick once; it decides what FanFit shows you. Ask us if you need to switch later.</p>
      <div className="mt-8">
        <OnboardingForm teams={teams ?? []} />
      </div>
    </main>
  );
}
