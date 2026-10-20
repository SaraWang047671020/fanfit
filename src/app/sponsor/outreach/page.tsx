import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fitBand } from "@/lib/sponsor-fit-band";
import { currentUser } from "@/lib/supabase/server";
import AccountBar from "../../AccountBar";
import PitchAnswer from "./PitchAnswer";
import PageHeader from "../../PageHeader";

export const metadata: Metadata = { title: "FanFit · Outreach" };

interface Note {
  team_id: string;
  message: string;
  target: string | null;
  fit_z: number | null;
  status: "new" | "interested" | "declined";
  created_at: string;
  report: { token: string; views: number } | null;
}
interface Pitch {
  id: string;
  team_id: string;
  team_name: string;
  team_league: string;
  team_city: string;
  message: string;
  report_token: string | null;
  status: "new" | "interested" | "declined";
  demo: boolean;
  created_at: string;
}

const STATUS: Record<Note["status"], { label: string; tone: string }> = {
  new: { label: "Waiting", tone: "border-line text-muted" },
  interested: { label: "Interested", tone: "border-gain bg-gain/10 text-gain" },
  declined: { label: "Passed", tone: "border-line text-muted line-through" },
};

/** Notes this brand sent to teams (with reports), and pitches teams sent to this brand. */
export default async function OutreachPage({ searchParams }: PageProps<"/sponsor/outreach">) {
  const { supabase, user, profile } = await currentUser();
  if (!user) redirect("/login?next=/sponsor/outreach");
  if (profile?.role !== "sponsor") redirect(profile?.role === "team" ? "/fanfit" : "/onboarding");
  const tab = (await searchParams).tab === "received" ? "received" : "sent";
  const [{ data: sponsor }, { data: notes }, { data: teams }, { data: inbox }] = await Promise.all([
    supabase.from("sponsors").select("name").eq("id", profile.sponsor_id!).single<{ name: string }>(),
    supabase
      .from("sponsor_interest")
      .select("team_id, message, target, fit_z, status, created_at, report:pitch_reports(token, views)")
      .order("created_at", { ascending: false })
      .returns<Note[]>(),
    supabase
      .from("teams")
      .select("id, name, league, city, claimed_at")
      .returns<{ id: string; name: string; league: string; city: string; claimed_at: string | null }[]>(),
    supabase.rpc("brand_inbox"),
  ]);
  const teamOf = new Map((teams ?? []).map((t) => [t.id, t]));
  const pitches = (inbox ?? []) as Pitch[];
  const fresh = pitches.filter((p) => p.status === "new").length;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <AccountBar name={profile.display_name ?? user.email ?? ""} org={sponsor?.name ?? "Your brand"} role="sponsor" />
      <PageHeader side="sponsor" icon="send" eyebrow={<>Outreach</>} title={<>Your notes and team pitches</>}>
        <p className="mt-3 max-w-3xl text-muted">
          Notes you sent from a team&apos;s page carry a FanFit report on why {sponsor?.name ?? "your brand"} fits their fans. Teams that
          find you in their sponsor finder can pitch you here too.
        </p>
      </PageHeader>

      <nav className="mt-6 flex gap-2 border-b border-line pb-3" aria-label="Outreach">
        {[
          ["sent", `Sent (${notes?.length ?? 0})`],
          ["received", fresh ? `Received (${fresh} new)` : `Received (${pitches.length})`],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={key === "sent" ? "/sponsor/outreach" : "/sponsor/outreach?tab=received"}
            aria-current={tab === key ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === key ? "bg-accent text-white" : "border border-line bg-panel text-muted hover:text-text"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "sent" ? (
        <section className="mt-6 rounded-3xl border border-line bg-panel/90 p-6">
          {!notes?.length ? (
            <p className="text-sm text-muted">
              No notes yet. Open a team from the{" "}
              <Link href="/sponsor" className="text-accent">
                ranking
              </Link>{" "}
              and use “Tell them you&apos;re interested”.
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
                        {n.report && (
                          <>
                            {" · "}
                            <a href={`/r/${n.report.token}`} target="_blank" rel="noreferrer" className="text-accent">
                              Report ↗
                            </a>
                            {` · opened ${n.report.views}×`}
                          </>
                        )}
                      </p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${STATUS[n.status].tone}`}>
                      {STATUS[n.status].label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : (
        <section className="mt-6 space-y-4">
          {!pitches.length && (
            <p className="rounded-3xl border border-line bg-panel/90 p-6 text-sm text-muted">
              No team has pitched you yet. Teams see brands their fans love in FanFit&apos;s sponsor finder and can send you a report from
              there.
            </p>
          )}
          {pitches.map((p) => (
            <article key={p.id} className={`rounded-3xl border bg-panel/90 p-6 ${p.status === "new" ? "border-accent/50" : "border-line"}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-lg font-semibold">
                  <Link href={`/sponsor/teams/${p.team_id}`} className="hover:text-accent">
                    {p.team_name}
                  </Link>
                  {p.demo && (
                    <span className="ml-2 rounded-full border border-warn px-2 py-0.5 text-[10px] font-semibold text-warn">DEMO</span>
                  )}
                  <span className="ml-2 text-xs font-normal text-muted">
                    {p.team_league} · {p.team_city}
                  </span>
                </p>
                <p className="text-xs text-muted">{new Date(p.created_at).toLocaleDateString()}</p>
              </div>
              <p className="mt-3">“{p.message}”</p>
              {p.report_token && (
                <p className="mt-2 text-sm">
                  <a href={`/r/${p.report_token}`} target="_blank" rel="noreferrer" className="font-semibold text-accent">
                    Read their FanFit report ↗
                  </a>
                </p>
              )}
              <div className="mt-4">
                <PitchAnswer id={p.id} status={p.status} />
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
