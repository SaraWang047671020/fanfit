import { DEMO_PROJECT, DEMO_SWAP, PACKAGE_A, TARGET_AUDIENCE } from "@/lib/demo";
import type { DemoSnapshot } from "@/lib/demo-analysis";
import type { Domain } from "@/lib/qloo";
import type { DomainComparison } from "@/lib/tasteframe";
import snapshotJson from "@/data/demo-snapshot.json";

// Served from a snapshot computed from live Qloo data (npm run snapshot), so judges
// always get an instant page that cannot hit rate limits.
const snapshot = snapshotJson as DemoSnapshot;
const DOMAIN_LABEL: Record<Domain, string> = { movie: "Film", artist: "Music", brand: "Brands" };

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="rounded-3xl border border-line bg-panel/90 p-6 sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-gain">TasteFrame · Demo project</p>
        <h1 className="mt-2 text-4xl font-bold sm:text-5xl">{DEMO_PROJECT.title}</h1>
        <p className="mt-3 max-w-3xl text-lg text-muted">{DEMO_PROJECT.logline}</p>
        <p className="mt-4 rounded-xl border-l-4 border-accent bg-panel-2 px-4 py-3 text-sm">
          <span className="font-semibold">Goal:</span> {DEMO_PROJECT.goal}
        </p>
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Section kicker="Taste Bridge" title={`Bridges to ${TARGET_AUDIENCE.label}`}>
          <p className="mb-4 text-sm text-muted">
            Entities ranked by Qloo for both the package and the audience seeds (
            {TARGET_AUDIENCE.seeds.map((s) => s.name).join(", ")}). Both ranks are shown as evidence.
          </p>
          <Bridges />
        </Section>
        <Section kicker="Drivers" title="What pulls Package A's film neighborhood?">
          <p className="mb-4 text-sm text-muted">Summed Qloo explainability scores across the top 20 film results.</p>
          <Drivers />
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

function Drivers() {
  return (
    <ul className="space-y-3 text-sm">
      {snapshot.drivers.map((d) => (
        <li key={d.id}>
          <div className="mb-1 flex justify-between">
            <span>
              {d.name} <span className="text-muted">· {d.slot.replace(/_\d$/, "")}</span>
            </span>
            <span className="font-mono text-muted">{Math.round(d.share * 100)}%</span>
          </div>
          <div className="h-2 rounded-full bg-panel-2">
            <div className="h-2 rounded-full bg-accent" style={{ width: `${d.share * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
