// Public pitch report: anyone with the link can read it, no sign-in. A snapshot made when it was sent.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AGES, AGE_LABEL } from "@/lib/fanfit-score";
import type { PitchReport } from "@/lib/pitch-report";
import type { Audience } from "@/lib/sponsor-detail";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "./PrintButton";

// One lookup per request (metadata and page), counted as one view.
const load = cache(async (token: string) => {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("report_by_token", { p_token: token });
  const row = (data as { body: PitchReport; demo: boolean; created_at: string }[] | null)?.[0];
  return row ?? null;
});

export async function generateMetadata({ params }: PageProps<"/r/[token]">): Promise<Metadata> {
  const r = await load((await params).token);
  return { title: r ? `${r.body.headline} · FanFit report` : "FanFit report", robots: { index: false } };
}

export default async function ReportPage({ params }: PageProps<"/r/[token]">) {
  const row = await load((await params).token);
  if (!row) notFound();
  const r = row.body;
  const from = r.kind === "team_to_brand" ? r.team.name : r.brand.name;
  const to = r.kind === "team_to_brand" ? r.brand.name : r.team.name;
  const fans = `${r.team.name} fans`;
  const customers = `${r.brand.name} fans`;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12 print:max-w-none print:py-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/" className="text-sm font-bold">
          <span className="text-gain">Fan</span>Fit
        </Link>
        <PrintButton />
      </div>
      {row.demo && (
        <p className="mt-4 rounded-2xl border border-warn bg-warn/10 px-4 py-2 text-sm text-warn">
          Demo report, made from a shared demo account. The data is real; the outreach is not.
        </p>
      )}

      <header className="mt-6 border-b border-line pb-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-gain">
          From {from} to {to} · {new Date(r.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{r.headline}</h1>
        <p className="mt-4 text-lg">{r.summary}</p>
        <p className="mt-3 font-semibold text-accent">{r.ask}</p>
        {r.message && (
          <blockquote className="mt-5 rounded-2xl border border-line bg-panel-2 p-4 text-sm">
            “{r.message}”<span className="mt-1 block text-xs text-muted">— {from}</span>
          </blockquote>
        )}
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Fan fit" value={r.fit.band} detail={r.fit.z === null ? "No Qloo score" : `${r.fit.z >= 0 ? "+" : ""}${r.fit.z.toFixed(1)}σ above a typical big brand`} />
        <Stat label={`Rank for ${r.brand.name}`} value={`#${r.fit.rank} of ${r.fit.of}`} detail="NBA, MLS, WNBA and NWSL teams" />
        <Stat label="Strongest shared fans" value={r.audience.overlapLabel} detail="the age group both audiences over-index on" />
      </section>

      <Section title="Who the shared fans are">
        <AudienceBars a={r.audience.team} b={r.audience.brand} aLabel={fans} bLabel={customers} best={r.audience.overlap} />
      </Section>

      {(r.shared.brands.length > 0 || r.shared.artists.length > 0 || r.shared.places.length > 0) && (
        <Section title="What people who like both also love" note={`Qloo, for people who like both ${r.team.name} and ${r.brand.name}, in ${r.team.city}.`}>
          <div className="grid gap-5 sm:grid-cols-3">
            <List title="Brands" items={r.shared.brands} />
            <List title="Artists" items={r.shared.artists} />
            <List title={`Places in ${r.team.city.split(",")[0]}`} items={r.shared.places.map((p) => p.name)} />
          </div>
          {r.traits.length > 0 && (
            <p className="mt-4 text-sm">
              <span className="text-muted">Shared brand traits: </span>
              {r.traits.flatMap((t) => t.tags).slice(0, 8).join(" · ")}
            </p>
          )}
        </Section>
      )}

      {r.timing && (r.timing.whyNow || r.timing.signals.length > 0) && (
        <Section title="Why now">
          {r.timing.whyNow && <p>{r.timing.whyNow}</p>}
          <ul className="mt-3 space-y-1.5 text-sm">
            {r.timing.signals.slice(0, 5).map((s) => (
              <li key={s.url + s.summary}>
                <span className="font-mono text-xs text-muted">{s.date}</span> {s.summary}{" "}
                <a href={s.url} target="_blank" rel="noreferrer" className="text-accent print:text-text">
                  source ↗
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {r.activation && (
        <Section title="A matchday idea" note={`Built from what ${r.audience.overlapLabel} fans of both love (Qloo).`}>
          <p className="text-lg font-semibold">{r.activation.title}</p>
          <p className="mt-1">{r.activation.concept}</p>
          {r.activation.hook && <p className="mt-2 text-sm text-muted">{r.activation.hook}</p>}
        </Section>
      )}

      {r.exclusivity && (
        <Section title="Category check">
          <p className={r.exclusivity.status === "clear" ? "text-gain" : "text-loss"}>
            {r.exclusivity.status === "clear"
              ? `${r.team.name}'s current sponsors don't hold ${r.brand.name}'s category.`
              : r.exclusivity.status === "already"
                ? `${r.brand.name} is already a ${r.team.name} partner.`
                : `${r.team.name} has a partner in this category: ${r.exclusivity.with.join(", ")}. Worth checking exclusivity first.`}
          </p>
          <p className="mt-1 text-xs text-muted">
            {r.exclusivity.source === "club" ? "From the club's sponsor list on FanFit." : "From a web search; the club has not listed its sponsors."}
          </p>
        </Section>
      )}

      <footer className="mt-10 border-t border-line pt-5 text-xs text-muted">
        <p>
          How this was made: fan fit compares how strongly people who like {r.brand.name} also like {r.team.name} with how those fans rate 40
          big brands (Qloo taste data). Audiences are Qloo demographics; timing comes from a web search with the sources above. It shows shared
          taste, not sales results.
        </p>
        <p className="mt-2 print:hidden">
          Made with <Link href="/" className="text-accent">FanFit</Link>: sponsorships your fans already love.
        </p>
      </footer>
    </main>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4 print:break-inside-avoid">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 print:break-inside-avoid">
      <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-accent">{title}</h2>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted">{title}</p>
      <ol className="mt-2 space-y-1 text-sm">
        {items.slice(0, 6).map((x, i) => (
          <li key={x}>
            <span className="mr-2 font-mono text-xs text-muted">{i + 1}</span>
            {x}
          </li>
        ))}
        {items.length === 0 && <li className="text-xs text-muted">Nothing from Qloo.</li>}
      </ol>
    </div>
  );
}

function AudienceBars({ a, b, aLabel, bLabel, best }: { a: Audience | null; b: Audience | null; aLabel: string; bLabel: string; best: string }) {
  if (!a || !b) return <p className="text-sm text-muted">Qloo has no audience data for one of the two.</p>;
  const bar = (v: number, tone: string) => (
    <div className="relative h-2 rounded-full bg-panel-2">
      <div className="absolute top-0 h-2 w-px bg-line" style={{ left: "50%" }} />
      <div className={`absolute top-0 h-2 rounded-full ${tone}`} style={v >= 0 ? { left: "50%", width: `${Math.min(50, v * 50)}%` } : { right: "50%", width: `${Math.min(50, -v * 50)}%` }} />
    </div>
  );
  return (
    <div className="grid grid-cols-[3.5rem_1fr_1fr] gap-x-3 gap-y-2 text-xs">
      <span />
      <span className="truncate font-semibold">{aLabel}</span>
      <span className="truncate font-semibold">{bLabel}</span>
      {AGES.map((g) => (
        <div key={g} className="contents">
          <span className={g === best ? "font-semibold text-gain" : "text-muted"}>{AGE_LABEL[g]}</span>
          {bar(a.age[g], "bg-gain")}
          {bar(b.age[g], "bg-accent")}
        </div>
      ))}
      <p className="col-span-3 mt-1 text-muted">Right of centre = more of this age group than average; left = fewer (Qloo).</p>
    </div>
  );
}
