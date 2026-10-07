import Link from "next/link";
import { DEMO_PROJECT, DEMO_SWAP, PACKAGE_A, TARGET_AUDIENCE } from "@/lib/demo";
import type { DemoSnapshot } from "@/lib/demo-analysis";
import type { Domain } from "@/lib/qloo";
import type { DomainComparison } from "@/lib/tasteframe";
import snapshotJson from "@/data/demo-snapshot.json";
import agentRunJson from "@/data/demo-agent-run.json";
import type { AgentEvent } from "@/lib/agent";

// Served from a snapshot computed from live Qloo data (npm run snapshot), so judges
// always get an instant page that cannot hit rate limits.
const snapshot = snapshotJson as DemoSnapshot;
const agentProposals =
  (agentRunJson.events as { event: AgentEvent }[]).map((e) => e.event).find((e) => e.type === "proposals")?.proposals ?? [];
const agentBest = [...agentProposals].sort((a, b) => b.evaluation.metrics.targetOverlap - a.evaluation.metrics.targetOverlap)[0];
const DOMAIN_LABEL: Record<Domain, string> = { movie: "Film", artist: "Music", brand: "Brands" };

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="rounded-3xl border border-line bg-panel/90 p-6 sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-gain">TasteFrame · Demo project</p>
        <h1 className="mt-2 text-4xl font-bold sm:text-5xl">{DEMO_PROJECT.title}</h1>
        <p className="mt-3 max-w-3xl text-lg text-muted">{DEMO_PROJECT.logline}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="flex-1 rounded-xl border-l-4 border-accent bg-panel-2 px-4 py-3 text-sm">
            <span className="font-semibold">Goal:</span> {DEMO_PROJECT.goal}
          </p>
          <Link href="/agent" className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bg">
            Let the agent find options →
          </Link>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
          {PACKAGE_A.entities.map((e) => (
            <span
              key={e.id}
              className={`rounded-full border px-3 py-1 ${e.slot === DEMO_SWAP.slot ? "border-loss text-loss line-through" : "border-line text-muted"}`}
            >
              <span className="opacity-60">{e.slot.replace(/_\d$/, "")} · </span>
              {e.name}
            </span>
          ))}
          <span className="text-accent">→</span>
          <span className="rounded-full border border-gain px-3 py-1 text-gain">
            <span className="opacity-60">cast · </span>
            {DEMO_SWAP.name}
          </span>
        </div>
      </header>

      <Section kicker="Shift Map" title="One casting swap, three cultural shifts">
        <ShiftMap />
      </Section>

      <Section kicker="Instinct vs. taste data" title="Ask an LLM alone, and the obvious picks barely move the needle">
        <InstinctVsData />
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section kicker="Taste Bridge" title={`Bridges to ${TARGET_AUDIENCE.label}`}>
          <p className="mb-4 text-sm text-muted">
            Entities ranked by Qloo for both the package and the audience seeds (
            {TARGET_AUDIENCE.seeds.map((s) => s.name).join(", ")}). Both ranks are shown as evidence.
          </p>
          <Bridges />
        </Section>
        <Section kicker="Influence" title="Which element shapes Package A the most?">
          <p className="mb-4 text-sm text-muted">
            Remove one element at a time and measure how much of the package&apos;s top-50 Qloo neighbourhood changes.
          </p>
          <Influence />
        </Section>
      </div>

      <footer className="mt-12 text-center text-xs text-muted">
        TasteFrame · Built with the Qloo Taste AI API (not affiliated with Qloo) · Every score on this page comes from Qloo
        data; nothing is invented by an LLM. · Qloo snapshot {snapshot.generatedAt.slice(0, 10)}
      </footer>
    </main>
  );
}

function Section({ kicker, title, children }: { kicker: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-3xl border border-line bg-panel/90 p-6 sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">{kicker}</p>
      <h2 className="mb-5 mt-1 text-2xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function ShiftMap() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {snapshot.comparisons.map((c) => (
        <DomainShift key={c.domain} c={c} />
      ))}
    </div>
  );
}

function DomainShift({ c }: { c: DomainComparison }) {
  const max = Math.max(1, ...[...c.tags.rising, ...c.tags.falling].map((t) => Math.abs(t.delta)));
  return (
    <div className="rounded-2xl border border-line bg-panel-2 p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold">{DOMAIN_LABEL[c.domain]}</h3>
        <span className="text-sm text-muted">
          <span className="text-2xl font-bold text-text">{Math.round(c.overlap * 100)}%</span> kept
        </span>
      </div>

      <ul className="mt-4 space-y-1.5 text-sm">
        {[...c.tags.rising.slice(0, 4), ...c.tags.falling.slice(0, 4)].map((t) => (
          <li key={t.tag} className="flex items-center gap-2">
            <span className="w-32 shrink-0 truncate text-muted">{t.tag}</span>
            <span
              className={`h-2 rounded-full ${t.delta > 0 ? "bg-gain" : "bg-loss"}`}
              style={{ width: `${(Math.abs(t.delta) / max) * 100}%`, minWidth: 6 }}
            />
            <span className={`ml-auto font-mono text-xs ${t.delta > 0 ? "text-gain" : "text-loss"}`}>
              {t.delta > 0 ? "+" : ""}
              {t.delta}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <EntityList title="Enters" items={c.gained.slice(0, 5).map((e) => e.name)} tone="text-gain" />
        <EntityList title="Leaves" items={c.lost.slice(0, 5).map((e) => e.name)} tone="text-loss" />
      </div>
    </div>
  );
}

function EntityList({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return (
    <div>
      <p className={`mb-1 text-xs font-bold uppercase tracking-wider ${tone}`}>{title}</p>
      <ul className="space-y-0.5 text-muted">
        {items.length ? items.map((n) => <li key={n}>{n}</li>) : <li className="italic">none</li>}
      </ul>
    </div>
  );
}

function Bridges() {
  return (
    <div className="space-y-5">
      {snapshot.bridges.map((r) => (
        <div key={r.domain}>
          <h3 className="mb-2 font-semibold">{DOMAIN_LABEL[r.domain]}</h3>
          {r.insufficientSignal ? (
            <p className="text-sm text-warn">Insufficient signal — no entity ranks for both sides.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="pb-1 font-medium">Candidate</th>
                  <th className="pb-1 text-right font-medium">Package rank</th>
                  <th className="pb-1 text-right font-medium">Audience rank</th>
                </tr>
              </thead>
              <tbody>
                {r.bridges.slice(0, 5).map((b) => (
                  <tr key={b.id} className="border-t border-line">
                    <td className="py-1.5">{b.name}</td>
                    <td className="py-1.5 text-right font-mono text-muted">#{b.rankInPackage}</td>
                    <td className="py-1.5 text-right font-mono text-muted">#{b.rankInAudience}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}

function Influence() {
  const max = Math.max(...snapshot.influence.map((e) => e.influence), 0.01);
  return (
    <ul className="space-y-3 text-sm">
      {snapshot.influence.map((e) => (
        <li key={e.id}>
          <div className="mb-1 flex justify-between gap-3">
            <span>
              {e.name} <span className="text-muted">· {e.slot.replace(/_\d$/, "")}</span>
            </span>
            <span className="font-mono text-muted">{Math.round(e.influence * 100)}% changes</span>
          </div>
          <div className="h-2 rounded-full bg-panel-2">
            <div className="h-2 rounded-full bg-accent" style={{ width: `${(e.influence / max) * 100}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">
            {e.perDomain.map((d) => `${DOMAIN_LABEL[d.domain]} ${Math.round(d.influence * 100)}%`).join(" · ")}
          </p>
        </li>
      ))}
    </ul>
  );
}

function InstinctVsData() {
  const base = snapshot.baseline.targetOverlap;
  const rows = [
    ...snapshot.llmOnly.flatMap((r) =>
      r.resolved ? [{ label: r.name, sub: "LLM-only suggestion (cast swap)", value: r.targetOverlap, agent: false }] : [],
    ),
    ...(agentBest
      ? [{ label: agentBest.evaluation.swaps.map((s) => s.name).join(" + "), sub: "TasteFrame agent (Qloo-grounded)", value: agentBest.evaluation.metrics.targetOverlap, agent: true }]
      : []),
  ];
  const max = Math.max(base, ...rows.map((r) => r.value)) * 1.1;
  return (
    <div>
      <p className="mb-4 max-w-3xl text-sm text-muted">
        We asked an LLM (no Qloo) to recast the lead for {TARGET_AUDIENCE.label}, then measured every suggestion with Qloo:
        how much of the package&apos;s cultural neighbourhood the audience shares. The line marks the original package.
      </p>
      <ul className="space-y-2.5 text-sm">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[minmax(0,11rem)_1fr_3.5rem] items-center gap-3">
            <span className="truncate">
              <span className={r.agent ? "font-semibold text-gain" : ""}>{r.label}</span>
              <span className="block truncate text-xs text-muted">{r.sub}</span>
            </span>
            <span className="relative h-3 rounded-full bg-panel-2">
              <span
                className={`absolute inset-y-0 left-0 rounded-full ${r.agent ? "bg-gain" : "bg-muted/60"}`}
                style={{ width: `${(r.value / max) * 100}%` }}
              />
              <span className="absolute -top-1 h-5 w-0.5 bg-text" style={{ left: `${(base / max) * 100}%` }} />
            </span>
            <span className={`text-right font-mono ${r.agent ? "text-gain" : "text-muted"}`}>
              {(r.value / base).toFixed(1)}×
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">
        × = audience overlap relative to the original package. Names come from the LLM; every score comes from Qloo.
      </p>
    </div>
  );
}
