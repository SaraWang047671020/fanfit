import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fitBand } from "@/lib/sponsor-fit-band";
import { currentUser } from "@/lib/supabase/server";
import AccountBar from "../../AccountBar";

export const metadata: Metadata = { title: "FanFit · Outreach" };

interface Note {
  team_id: string;
  message: string;
  target: string | null;
  fit_z: number | null;
  status: "new" | "interested" | "declined";
  created_at: string;
  responded_at: string | null;
}

const STATUS: Record<Note["status"], { label: string; tone: string }> = {
  new: { label: "Waiting", tone: "border-line text-muted" },
  interested: { label: "Interested", tone: "border-gain bg-gain/10 text-gain" },
  declined: { label: "Passed", tone: "border-line text-muted line-through" },
};

/** The notes this brand has sent to teams, and their answers. */
export default async function OutreachPage() {
  const { supabase, user, profile } = await currentUser();
  if (!user) redirect("/login?next=/sponsor/outreach");
  if (profile?.role !== "sponsor") redirect(profile?.role === "team" ? "/fanfit" : "/onboarding");
  const [{ data: sponsor }, { data: notes }, { data: teams }] = await Promise.all([
    supabase.from("sponsors").select("name").eq("id", profile.sponsor_id!).single<{ name: string }>(),
    supabase.from("sponsor_interest").select("team_id, message, target, fit_z, status, created_at, responded_at").order("created_at", { ascending: false }).returns<Note[]>(),
    supabase.from("teams").select("id, name, league, city, claimed_at").returns<{ id: string; name: string; league: string; city: string; claimed_at: string | null }[]>(),
  ]);
  const teamOf = new Map((teams ?? []).map((t) => [t.id, t]));
  const answered = (notes ?? []).filter((n) => n.status !== "new").length;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <AccountBar name={profile.display_name ?? user.email ?? ""} org={sponsor?.name ?? "Your brand"} role="sponsor" />
      <header className="mt-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-gain">Outreach</p>
        <h1 className="mt-2 text-4xl font-bold">Teams you&apos;ve contacted</h1>
        <p className="mt-3 max-w-3xl text-muted">
          Notes you sent from a team&apos;s page, with FanFit&apos;s fit score attached. Teams on FanFit answer here; the rest see your note when
          they join. {notes?.length ? `${answered} of ${notes.length} answered.` : ""}
        </p>
      </header>
      <section className="mt-8 rounded-3xl border border-line bg-panel/90 p-6">
        {!notes?.length ? (
          <p className="text-sm text-muted">
            No notes yet. Open a team from the <Link href="/sponsor" className="text-accent">ranking</Link> and use “Tell them you&apos;re
            interested”.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {notes.map((n) => {
              const t = teamOf.get(n.team_id);
              return (
                <li key={n.team_id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      <Link href={`/sponsor/teams/${n.team_id}`} className="hover:text-accent">
                        {t?.name ?? "Team"}
                      </Link>
                      <span className="ml-2 text-xs font-normal text-muted">
                        {t?.league} · {t?.city}
                        {!t?.claimed_at && " · not on FanFit yet"}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-muted">“{n.message}”</p>
                    <p className="mt-1 text-xs text-muted">
                      Sent {new Date(n.created_at).toLocaleDateString()}
                      {n.fit_z !== null && ` · ${fitBand(n.fit_z)} fit (${n.fit_z >= 0 ? "+" : ""}${n.fit_z.toFixed(1)}σ)`}
                      {n.target && ` · aimed at ${n.target}`}
                    </p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${STATUS[n.status].tone}`}>{STATUS[n.status].label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
