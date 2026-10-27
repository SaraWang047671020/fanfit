import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SPONSOR_CATEGORIES } from "@/lib/fanfit-score";
import { fitBand } from "@/lib/sponsor-fit-band";
import { currentUser } from "@/lib/supabase/server";
import AccountBar from "../../AccountBar";
import AnswerButtons from "./AnswerButtons";
import WithdrawPitch from "./WithdrawPitch";
import PageHeader from "../../PageHeader";

export const metadata: Metadata = { title: "FanFit · Outreach" };

interface Received {
  id: string;
  sponsor_name: string;
  sponsor_categories: string[];
  message: string;
  contact_email: string | null;
  target: string | null;
  fit_z: number | null;
  status: "new" | "interested" | "declined";
  demo: boolean;
  created_at: string;
  report_token: string | null;
}
interface Sent {
  id: string;
  brand_name: string;
  message: string;
  status: "new" | "interested" | "declined";
  demo: boolean;
  created_at: string;
  report: { token: string; views: number; last_viewed_at: string | null; body: { fit: { band: string; z: number | null } } } | null;
}

const ANSWER: Record<Sent["status"], { label: string; tone: string }> = {
  new: { label: "No reply yet", tone: "border-line text-muted" },
  interested: { label: "Interested", tone: "border-gain bg-gain/10 text-gain" },
  declined: { label: "Passed", tone: "border-line text-muted" },
};

/** Pitches this team sent to brands (with their reports) and notes brands sent to this team. */
export default async function TeamOutreachPage({ searchParams }: PageProps<"/team/outreach">) {
  const { supabase, user, profile } = await currentUser();
  if (!user) redirect("/login?next=/team/outreach");
  if (profile?.role !== "team") redirect(profile?.role === "sponsor" ? "/sponsor" : "/onboarding");
  if (!profile.team_approved) redirect("/fanfit");
  const tab = (await searchParams).tab === "received" ? "received" : "sent";

  const [{ data: team }, { data: inbox }, { data: sent }, { data: listed }] = await Promise.all([
    supabase.from("teams").select("name").eq("id", profile.team_id!).single<{ name: string }>(),
    supabase.rpc("team_interest"),
    supabase
      .from("team_outreach")
      .select("id, brand_name, message, status, demo, created_at, report:pitch_reports(token, views, last_viewed_at, body)")
      .order("created_at", { ascending: false })
      .returns<Sent[]>(),
    supabase.from("team_sponsors").select("name, category").eq("team_id", profile.team_id!).returns<{ name: string; category: string }[]>(),
  ]);
  const received = (inbox ?? []) as Received[];
  const fresh = received.filter((n) => n.status === "new").length;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <AccountBar name={profile.display_name ?? user.email ?? ""} org={team?.name ?? "Your team"} role="team" />
      <PageHeader side="team" icon="send" eyebrow={<>Outreach</>} title={<>Pitches and brand interest</>}>
        <p className="mt-3 max-w-3xl text-muted">
          Pitch a brand from the sponsor finder (“✉ Prepare pitch”): FanFit builds a one-page report you can share by link, and you see when
          it is opened. Brands that find you on FanFit write in here too.
        </p>
      </PageHeader>

      <nav className="mt-6 flex gap-2 border-b border-line pb-3" aria-label="Outreach">
        {[
          ["sent", `Sent (${sent?.length ?? 0})`],
          ["received", fresh ? `Received (${fresh} new)` : `Received (${received.length})`],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={key === "sent" ? "/team/outreach" : "/team/outreach?tab=received"}
            aria-current={tab === key ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === key ? "bg-accent text-white" : "border border-line bg-panel text-muted hover:text-text"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "sent" ? (
        <section className="mt-6 space-y-3">
          {!sent?.length && (
            <p className="rounded-3xl border border-line bg-panel/90 p-6 text-sm text-muted">
              No pitches yet. In the{" "}
              <Link href="/fanfit" className="text-accent">
                sponsor finder
              </Link>
              , open a brand under Who to call and use “✉ Prepare pitch”.
            </p>
          )}
          {(sent ?? []).map((p) => (
            <article key={p.id} className="flex flex-wrap items-start justify-between gap-3 rounded-3xl border border-line bg-panel/90 p-5">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {p.brand_name}
                  {p.demo && (
                    <span className="ml-2 rounded-full border border-warn px-2 py-0.5 text-[10px] font-semibold text-warn">DEMO</span>
                  )}
                  {p.report && <span className="ml-2 text-xs font-normal text-gain">{p.report.body.fit.band} fit</span>}
                </p>
                <p className="mt-1 text-sm text-muted">“{p.message}”</p>
                <p className="mt-2 text-xs text-muted">
                  Sent {new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  {p.report && (
                    <>
                      {" · "}
                      <a href={`/r/${p.report.token}`} target="_blank" rel="noreferrer" className="text-accent">
                        Report ↗
                      </a>
                      {" · "}
                      {p.report.views
                        ? `opened ${p.report.views} time${p.report.views === 1 ? "" : "s"}, last ${new Date(p.report.last_viewed_at!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                        : "not opened yet"}
                    </>
                  )}
                </p>
                <WithdrawPitch id={p.id} />
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${ANSWER[p.status].tone}`}
                title="Brands on FanFit answer here"
              >
                {ANSWER[p.status].label}
              </span>
            </article>
          ))}
        </section>
      ) : (
        <section className="mt-6 space-y-4">
          {!received.length && (
            <p className="rounded-3xl border border-line bg-panel/90 p-6 text-sm text-muted">
              No brands have reached out yet. Brands see your team ranked for their audience; keep your sponsor list current so they know
              which categories are open.
            </p>
          )}
          {received.map((n) => {
            const covered = new Set<string>(
              SPONSOR_CATEGORIES.filter((c) => n.sponsor_categories.includes(c.key)).flatMap((c) => c.covers),
            );
            const clash = (listed ?? []).filter((s) => covered.has(s.category));
            const labels = SPONSOR_CATEGORIES.filter((c) => n.sponsor_categories.includes(c.key)).map((c) => c.label);
            return (
              <article
                key={n.id}
                className={`rounded-3xl border bg-panel/90 p-6 ${n.status === "new" ? "border-accent/50" : "border-line"}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-lg font-semibold">
                    {n.sponsor_name}
                    {n.demo && (
                      <span className="ml-2 rounded-full border border-warn px-2 py-0.5 text-[10px] font-semibold text-warn">DEMO</span>
                    )}
                  </p>
                  <p className="text-xs text-muted">{new Date(n.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {labels.join(", ") || "No categories set"}
                  {n.fit_z !== null && (
                    <span className="ml-2 font-semibold text-gain">
                      {fitBand(n.fit_z)} fit with your fans ({n.fit_z >= 0 ? "+" : ""}
                      {n.fit_z.toFixed(1)}σ)
                    </span>
                  )}
                  {n.target && <span> · looking for {n.target}</span>}
                </p>
                <p className="mt-3">“{n.message}”</p>
                {n.report_token && (
                  <p className="mt-2 text-sm">
                    <a href={`/r/${n.report_token}`} target="_blank" rel="noreferrer" className="font-semibold text-accent">
                      Read their FanFit report ↗
                    </a>
                  </p>
                )}
                {clash.length > 0 ? (
                  <p className="mt-3 text-xs text-loss">
                    Exclusivity: you list {clash.map((s) => s.name).join(", ")} in this category. Check your contracts before talking.
                  </p>
                ) : (
                  <p className="mt-3 text-xs text-gain">No clash with your listed sponsors.</p>
                )}
                {n.contact_email && (
                  <p className="mt-1 text-xs text-muted">
                    Contact:{" "}
                    <a href={`mailto:${n.contact_email}`} className="text-accent">
                      {n.contact_email}
                    </a>
                  </p>
                )}
                <div className="mt-4">
                  <AnswerButtons id={n.id} status={n.status} />
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
