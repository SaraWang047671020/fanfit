"use client";

import { useMemo, useRef, useState } from "react";
import type { CategoryHit, FanfitEvent, TeamInfo, Timing } from "@/lib/fanfit";
import type { Activation } from "@/lib/fanfit-activation";
import ActivationPanel from "./ActivationPanel";
import {
  AGES,
  AGE_LABEL,
  type Age,
  type BrandHit,
  type FitRow,
  type Kind,
  SPONSOR_CATEGORIES,
  type Sponsor,
  type SponsorCategoryKey,
  type Weights,
  normalize,
  sameCompany,
  scoreBrands,
  weightsFromAffinity,
} from "@/lib/fanfit-score";

type Step = { id: string; label: string; status: "running" | "done" | "warn"; detail?: string };
type Buckets = Partial<Record<Age, BrandHit[]>>;
type CategoryResult = { location: string; considered: number; items: CategoryHit[] };
type ActivationState = { status: "loading" } | { status: "done"; data: Activation } | { status: "error"; message: string };

const PRESETS = [
  { team: "Austin FC", city: "Austin, TX" },
  { team: "Savannah Bananas", city: "Savannah, GA" },
  { team: "Seattle Sounders FC", city: "Seattle, WA" },
  { team: "Portland Thorns FC", city: "Portland, OR" },
];
const SHOWN: Record<Kind, number> = { brand: 15, place: 12 };
const TIMING_BOOST = 3; // each timing point moves a candidate up 3 places
const TABS: { kind: Kind; label: string; hint: string }[] = [
  { kind: "brand", label: "Brands", hint: "National and regional brands these fans love (Qloo brands, team + city as taste signals)." },
  { kind: "place", label: "Local businesses", hint: "Restaurants, bars, shops and services in the city that these fans love (Qloo places)." },
];

const even = () => Object.fromEntries(AGES.map((a) => [a, 1 / AGES.length])) as Weights;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const complete = (b: Buckets): b is Record<Age, BrandHit[]> => AGES.every((a) => b[a]);

export default function FanfitConsole({ initial = PRESETS[0] }: { initial?: { team: string; city: string } }) {
  const [team, setTeam] = useState(initial.team);
  const [city, setCity] = useState(initial.city);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [info, setInfo] = useState<TeamInfo | null>(null);
  const [estimate, setEstimate] = useState<Weights | null>(null);
  const [gender, setGender] = useState<{ male?: number; female?: number }>({});
  const [weights, setWeights] = useState<Weights>(even());
  const [buckets, setBuckets] = useState<Record<Kind, Buckets>>({ brand: {}, place: {} });
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [timings, setTimings] = useState<Record<string, Timing>>({});
  const [tab, setTab] = useState<Kind>("brand");
  const [checking, setChecking] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [activations, setActivations] = useState<Record<string, ActivationState>>({});
  const [categories, setCategories] = useState<Partial<Record<SponsorCategoryKey, CategoryResult>>>({});
  const runId = useRef(0);

  async function activate(row: FitRow, kind: Kind) {
    if (!info) return;
    setActivations((a) => ({ ...a, [row.id]: { status: "loading" } }));
    try {
      const res = await fetch("/api/fanfit/activation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team: { id: info.id, name: info.name, city: info.city },
          partner: { id: row.id, name: row.name, kind, category: row.category },
          driver: row.driver,
          whyNow: timings[row.id]?.whyNow ?? "",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setActivations((a) => ({ ...a, [row.id]: { status: "done", data: json as Activation } }));
    } catch (err) {
      setActivations((a) => ({ ...a, [row.id]: { status: "error", message: err instanceof Error ? err.message : String(err) } }));
    }
  }

  function apply(e: FanfitEvent) {
    switch (e.type) {
      case "step":
        setSteps((s) => (s.some((x) => x.id === e.id) ? s.map((x) => (x.id === e.id ? e : x)) : [...s, e]));
        break;
      case "team":
        setInfo(e.team);
        break;
      case "composition": {
        const w = e.estimated ? weightsFromAffinity(e.age) : even();
        setEstimate(w);
        setWeights(w);
        setGender(e.gender);
        break;
      }
      case "bucket":
        setBuckets((b) => ({ ...b, [e.kind]: { ...b[e.kind], [e.age]: e.items } }));
        break;
      case "category":
        setCategories((c) => ({ ...c, [e.key]: { location: e.location, considered: e.considered, items: e.items } }));
        break;
      case "sponsors":
        setSponsors(e.sponsors);
        break;
      case "timing":
        setTimings((t) => ({ ...t, [e.timing.brandId]: e.timing }));
        break;
      case "done":
        setElapsed(e.ms);
        break;
      case "error":
        setError(e.message);
        break;
    }
  }

  async function stream(body: object, id: number) {
    const res = await fetch("/api/fanfit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done || runId.current !== id) break;
      buf += value;
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) apply(JSON.parse(line) as FanfitEvent);
    }
  }

  async function run() {
    const id = ++runId.current;
    setStatus("running");
    setError(null);
    setSteps([]);
    setInfo(null);
    setEstimate(null);
    setGender({});
    setWeights(even());
    setBuckets({ brand: {}, place: {} });
    setSponsors([]);
    setTimings({});
    setActivations({});
    setCategories({});
    setElapsed(null);
    try {
      await stream({ team, city }, id);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  const mix = useMemo(() => normalize(weights), [weights]);
  const top = useMemo(() => {
    const score = (k: Kind) => {
      const b = buckets[k];
      return complete(b) ? scoreBrands(b, mix).slice(0, SHOWN[k]) : [];
    };
    return { brand: score("brand"), place: score("place") };
  }, [buckets, mix]);
  const ranked = useMemo(
    () => ({ brand: rank(top.brand, timings), place: rank(top.place, timings) }),
    [top, timings],
  );
  const unchecked = top[tab].filter((r) => !timings[r.id]);

  async function checkNew() {
    if (!info) return;
    setChecking(true);
    try {
      const items = unchecked.slice(0, 10).map(({ id, name, category, address }) => ({
        id,
        name,
        category,
        ...(tab === "place" ? { address: address ?? "" } : {}),
      }));
      await stream({ team: info.name, city: info.city, brands: items }, runId.current);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  }

  const running = status === "running";
  const current = ranked[tab];
  const hint = TABS.find((t) => t.kind === tab)!.hint;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-line bg-panel/90 p-6 sm:p-8">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Team" value={team} onChange={setTeam} />
          <Field label="Home city" value={city} onChange={setCity} />
          <button
            onClick={run}
            disabled={running || !team.trim() || !city.trim()}
            className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-bg disabled:opacity-50"
          >
            {running ? "Running…" : "Find sponsors (~1–2 min)"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">Try:</span>
          {PRESETS.map((p) => (
            <button
              key={p.team}
              onClick={() => {
                setTeam(p.team);
                setCity(p.city);
              }}
              disabled={running}
              className="rounded-full border border-line px-3 py-1 text-muted hover:border-accent hover:text-text disabled:opacity-50"
            >
              {p.team}
            </button>
          ))}
        </div>
        {error && <p className="mt-3 text-sm text-loss">{error}</p>}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-line bg-panel/90 p-6">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Agent trace</p>
            {steps.length === 0 && <p className="mt-3 text-sm text-muted">Pick a team and run to watch each step.</p>}
            <ol className="mt-4 space-y-3">
              {steps.map((s, i) => (
                <li key={s.id} className="rounded-xl border border-line bg-panel-2 p-3 text-sm">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-xs text-muted">{i + 1}</span>
                    <span className="font-semibold">{s.label}</span>
                  </div>
                  <p className={`mt-1 ${s.status === "done" ? "text-gain" : s.status === "warn" ? "text-warn" : "animate-pulse text-muted"}`}>
                    {s.status === "done" ? "→ " : s.status === "warn" ? "⚠ " : ""}
                    {s.detail ?? "working…"}
                  </p>
                </li>
              ))}
            </ol>
            {elapsed !== null && <p className="mt-3 text-xs text-muted">Finished in {(elapsed / 1000).toFixed(0)} s.</p>}
          </section>

          {estimate && (
            <FanMix
              weights={mix}
              raw={weights}
              estimate={estimate}
              gender={gender}
              onChange={setWeights}
              onReset={() => setWeights(estimate)}
            />
          )}

          {sponsors.length > 0 && (
            <section className="rounded-3xl border border-line bg-panel/90 p-6">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Current sponsors found ({sponsors.length})</p>
              <p className="mt-1 text-xs text-muted">From web search, used for exclusivity checks. Lists can miss deals; verify before outreach.</p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {sponsors.map((s) => (
                  <li key={s.name} className="flex items-baseline justify-between gap-3">
                    <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="hover:text-accent">
                      {s.name}
                    </a>
                    <span className="font-mono text-xs text-muted">{s.category}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <section className="rounded-3xl border border-line bg-panel/90 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">
                Who to call {info && <span className="text-muted normal-case tracking-normal">· {info.name}</span>}
              </p>
            </div>
            <div role="tablist" className="flex rounded-full border border-line bg-panel-2 p-1 text-sm">
              {TABS.map((t) => (
                <button
                  key={t.kind}
                  role="tab"
                  aria-selected={tab === t.kind}
                  onClick={() => setTab(t.kind)}
                  className={`rounded-full px-4 py-1.5 font-semibold ${tab === t.kind ? "bg-accent text-bg" : "text-muted hover:text-text"}`}
                >
                  {t.label}
                  {top[t.kind].length > 0 && <span className="ml-1.5 font-mono text-xs opacity-70">{ranked[t.kind].ranked.length}</span>}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">
            {hint} Rank = fan fit weighted by the fan mix, moved up {TIMING_BOOST} places per timing point; anything that clashes with a
            current sponsor&apos;s category is set aside.
          </p>
          {unchecked.length > 0 && Object.keys(timings).length > 0 && !running && (
            <button
              onClick={checkNew}
              disabled={checking}
              className="mt-3 rounded-full border border-accent px-3 py-1 text-xs font-semibold text-accent disabled:opacity-50"
            >
              {checking ? "Checking…" : `Check timing for ${Math.min(10, unchecked.length)} unchecked`}
            </button>
          )}

          {top[tab].length === 0 && <p className="mt-4 text-sm text-muted">Results appear once all six age groups are in.</p>}
          <ol className="mt-4 space-y-3">
            {current.ranked.map((r, i) => (
              <Card
                key={r.row.id}
                rank={i + 1}
                row={r.row}
                fitRank={r.fitRank}
                timing={timings[r.row.id]}
                activation={activations[r.row.id]}
                onActivate={running ? undefined : () => activate(r.row, tab)}
              />
            ))}
          </ol>
          {current.excluded.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-bold uppercase tracking-wider text-loss">Set aside: already signed or category conflict</p>
              <ol className="mt-3 space-y-3 opacity-75">
                {current.excluded.map((r) => (
                  <Card key={r.row.id} row={r.row} fitRank={r.fitRank} timing={timings[r.row.id]} />
                ))}
              </ol>
            </div>
          )}
        </section>
      </div>

      {Object.keys(categories).length > 0 && info && <CategoryGrid categories={categories} sponsors={sponsors} city={info.city} />}
    </div>
  );
}

function CategoryGrid({
  categories,
  sponsors,
  city,
}: {
  categories: Partial<Record<SponsorCategoryKey, CategoryResult>>;
  sponsors: Sponsor[];
  city: string;
}) {
  return (
    <section className="rounded-3xl border border-line bg-panel/90 p-6">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Best fit by sponsorship category</p>
      <p className="mt-1 text-xs text-muted">
        Top brands in each category for these fans (Qloo, team + {city}), ranked by affinity. Sponsorship is sold by category, so this
        is the list to work through once a category is open; categories with a current sponsor are flagged.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {SPONSOR_CATEGORIES.map((c) => {
          const r = categories[c.key];
          if (!r) return null;
          const signed = sponsors.filter((s) => (c.covers as readonly string[]).includes(s.category));
          return (
            <div key={c.key} className="rounded-xl border border-line bg-panel-2 p-4 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{c.label}</span>
                <span className="font-mono text-xs text-muted">
                  {r.location === city ? "" : "US-wide · "}
                  {r.considered} found
                </span>
              </div>
              {signed.length > 0 && <p className="mt-1 text-xs text-loss">Signed: {signed.map((s) => s.name).join(", ")}</p>}
              {r.items.length === 0 && <p className="mt-2 text-xs text-muted">No brands in Qloo for this category.</p>}
              <ol className="mt-2 space-y-1">
                {r.items.map((it, i) => {
                  const current = sponsors.some((s) => sameCompany(it.name, s.name));
                  return (
                    <li key={it.id} className="flex items-baseline gap-2">
                      <span className="w-4 font-mono text-xs text-muted">{i + 1}</span>
                      <span className={current ? "text-gain" : ""}>{it.name}</span>
                      {current && <span className="text-xs text-gain">current sponsor</span>}
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function rank(top: FitRow[], timings: Record<string, Timing>) {
  const rows = top.map((row, i) => {
    const t = timings[row.id];
    return {
      row,
      fitRank: i + 1,
      excluded: !!t && (t.existing.length > 0 || t.conflicts.length > 0),
      key: i + 1 - TIMING_BOOST * (t?.timing ?? 0),
    };
  });
  const byKey = (a: (typeof rows)[number], b: (typeof rows)[number]) => a.key - b.key || a.fitRank - b.fitRank;
  return { ranked: rows.filter((r) => !r.excluded).sort(byKey), excluded: rows.filter((r) => r.excluded) };
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-[0.12em] text-accent">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={80}
        className="mt-2 w-full rounded-xl border border-line bg-panel-2 px-4 py-2.5 text-sm outline-none focus:border-accent"
      />
    </label>
  );
}

function FanMix({
  weights,
  raw,
  estimate,
  gender,
  onChange,
  onReset,
}: {
  weights: Weights;
  raw: Weights;
  estimate: Weights;
  gender: { male?: number; female?: number };
  onChange: (w: Weights) => void;
  onReset: () => void;
}) {
  const edited = AGES.some((a) => Math.abs(weights[a] - estimate[a]) > 0.005);
  const lean = (gender.male ?? 0) - (gender.female ?? 0);
  return (
    <section className="rounded-3xl border border-line bg-panel/90 p-6">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Fan mix</p>
        {edited && (
          <button onClick={onReset} className="text-xs text-muted hover:text-text">
            Reset to Qloo estimate
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-muted">
        {edited ? "Your mix (e.g. from ticketing or social insights)." : "Qloo's estimate of who over-indexes for this team."} Drag to see
        both lists change; no new Qloo calls.
      </p>
      <div className="mt-4 space-y-2.5">
        {AGES.map((a) => (
          <div key={a} className="grid grid-cols-[3rem_1fr_3rem] items-center gap-3 text-sm">
            <span className="text-muted">{AGE_LABEL[a]}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={raw[a]}
              onChange={(e) => onChange({ ...raw, [a]: Number(e.target.value) })}
              className="accent-[var(--gain)]"
              aria-label={`Share of fans aged ${AGE_LABEL[a]}`}
            />
            <span className="text-right font-mono text-xs">{pct(weights[a])}</span>
          </div>
        ))}
      </div>
      {Math.abs(lean) > 0.05 && (
        <p className="mt-3 text-xs text-muted">Qloo: fans lean {lean > 0 ? "male" : "female"} ({lean > 0 ? "+" : ""}{lean.toFixed(2)}).</p>
      )}
    </section>
  );
}

const TIMING_TONE = ["text-muted", "text-warn", "text-gain/80", "text-gain"];

function Card({
  rank,
  row,
  fitRank,
  timing,
  activation,
  onActivate,
}: {
  rank?: number;
  row: FitRow;
  fitRank: number;
  timing?: Timing;
  activation?: ActivationState;
  onActivate?: () => void;
}) {
  const flags: { tone: string; text: string }[] = [];
  if (timing) {
    if (timing.existing.length) flags.push({ tone: "text-loss", text: `Already a sponsor (${timing.existing.map((s) => s.name).join(", ")})` });
    if (timing.conflicts.length)
      flags.push({ tone: "text-loss", text: `Conflicts with ${timing.conflicts.map((s) => `${s.name} (${s.category})`).join(", ")}` });
    if (timing.crowded.length)
      flags.push({ tone: "text-warn", text: `Same group as ${timing.crowded.map((s) => `${s.name} (${s.category})`).join(", ")}` });
    if (timing.relationship) flags.push({ tone: "text-warn", text: `Existing tie: ${timing.relationship}` });
    if (timing.fitRisk) flags.push({ tone: "text-muted", text: `Risk: ${timing.fitRisk}` });
  }
  return (
    <li className="rounded-xl border border-line bg-panel-2 p-4 text-sm">
      <div className="flex items-baseline gap-3">
        <span className="w-6 font-mono text-lg font-bold">{rank ?? "—"}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-semibold">{row.name}</span>
            <span className="text-xs text-muted">
              fit #{fitRank} · {row.score.toFixed(0)}/100
            </span>
          </div>
          <p className="text-xs text-muted">
            {timing?.categories.join(" / ") ?? row.category} · strongest with fans {AGE_LABEL[row.driver]} · in {row.reach}/6 age groups
          </p>
          {row.noLocal && (
            <p className="text-xs text-warn">No local data in Qloo for this city; scored on the team&apos;s fans alone.</p>
          )}
          {row.address && <p className="text-xs text-muted">{row.address}</p>}
          {timing ? (
            <>
              <p className="mt-2">
                <span className={`font-mono text-xs font-bold ${TIMING_TONE[timing.timing]}`}>timing {timing.timing}/3</span>{" "}
                {timing.whyNow || <span className="text-muted">No recent reason found.</span>}
              </p>
              {flags.map((f) => (
                <p key={f.text} className={`mt-1 text-xs ${f.tone}`}>
                  {f.text}
                </p>
              ))}
              {timing.signals.length > 0 && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-muted">{timing.signals.length} signals with sources</summary>
                  <ul className="mt-1 space-y-1">
                    {timing.signals.map((s) => (
                      <li key={s.url + s.summary}>
                        <span className="font-mono text-muted">{s.type}</span> {s.date} · {s.summary}{" "}
                        <a href={s.url} target="_blank" rel="noreferrer" className="text-accent">
                          source ↗
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          ) : (
            <p className="mt-2 text-xs text-muted">Timing and exclusivity not checked yet.</p>
          )}
          {onActivate && activation?.status !== "done" && (
            <button
              onClick={onActivate}
              disabled={activation?.status === "loading"}
              className="mt-3 rounded-full border border-gain px-3 py-1 text-xs font-semibold text-gain disabled:opacity-60"
            >
              {activation?.status === "loading" ? "Designing activation… (~15 s)" : "✦ Activation idea"}
            </button>
          )}
          {activation?.status === "error" && <p className="mt-2 text-xs text-loss">{activation.message}</p>}
          {activation?.status === "done" && <ActivationPanel a={activation.data} partner={row.name} />}
        </div>
      </div>
    </li>
  );
}
