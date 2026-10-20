import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SPONSOR_CATEGORIES } from "@/lib/fanfit-score";
import { fitBand } from "@/lib/sponsor-fit-band";
import { currentUser } from "@/lib/supabase/server";
import AccountBar from "../../AccountBar";
import AnswerButtons from "./AnswerButtons";

export const metadata: Metadata = { title: "FanFit · Brand interest" };

interface Note {
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
}

/** Brands that told this team they'd like to talk, with FanFit's fit and a check against the club's current sponsors. */
export default async function TeamInterestPage() {
  const { supabase, user, profile } = await currentUser();
  if (!user) redirect("/login?next=/team/interest");
  if (profile?.role !== "team") redirect(profile?.role === "sponsor" ? "/sponsor" : "/onboarding");
  if (!profile.team_approved) redirect("/fanfit");
  const [{ data: team }, { data: notes }, { data: listed }] = await Promise.all([
    supabase.from("teams").select("name").eq("id", profile.team_id!).single<{ name: string }>(),
    supabase.rpc("team_interest"),
    supabase.from("team_sponsors").select("name, category").eq("team_id", profile.team_id!).returns<{ name: string; category: string }[]>(),
  ]);
  const inbox = (notes ?? []) as Note[];
  const fresh = inbox.filter((n) => n.status === "new").length;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <AccountBar name={profile.display_name ?? user.email ?? ""} org={team?.name ?? "Your team"} role="team" />
      <header className="mt-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-gain">Brand interest</p>
        <h1 className="mt-2 text-4xl font-bold">Brands that want to talk</h1>
        <p className="mt-3 max-w-3xl text-muted">
          Brands find you on FanFit by how much your fans like them. Each note carries FanFit&apos;s fit score and is checked against your
          current sponsors. {fresh ? `${fresh} waiting for an answer.` : ""}
        </p>
      </header>
      <section className="mt-8 space-y-4">
        {!inbox.length && (
          <p className="rounded-3xl border border-line bg-panel/90 p-6 text-sm text-muted">
            No brands have reached out yet. Brands see your team ranked for their audience; keep your sponsor list current so they know which
            categories are open.
          </p>
        )}
        {inbox.map((n) => {
          const covered = new Set<string>(SPONSOR_CATEGORIES.filter((c) => n.sponsor_categories.includes(c.key)).flatMap((c) => c.covers));
          const clash = (listed ?? []).filter((s) => covered.has(s.category));
          const labels = SPONSOR_CATEGORIES.filter((c) => n.sponsor_categories.includes(c.key)).map((c) => c.label);
          return (
            <article key={n.id} className={`rounded-3xl border bg-panel/90 p-6 ${n.status === "new" ? "border-accent/50" : "border-line"}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-lg font-semibold">
                  {n.sponsor_name}
                  {n.demo && <span className="ml-2 rounded-full border border-warn px-2 py-0.5 text-[10px] font-semibold text-warn">DEMO</span>}
                </p>
                <p className="text-xs text-muted">{new Date(n.created_at).toLocaleDateString()}</p>
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
              {clash.length > 0 ? (
                <p className="mt-3 text-xs text-loss">
                  Exclusivity: you list {clash.map((s) => s.name).join(", ")} in this category. Check your contracts before talking.
                </p>
              ) : (
                <p className="mt-3 text-xs text-gain">No clash with your listed sponsors.</p>
              )}
              {n.contact_email && (
                <p className="mt-1 text-xs text-muted">
                  Contact: <a href={`mailto:${n.contact_email}`} className="text-accent">{n.contact_email}</a>
                </p>
              )}
              <div className="mt-4">
                <AnswerButtons id={n.id} status={n.status} />
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
