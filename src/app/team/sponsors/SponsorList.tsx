"use client";

import { useState, useTransition } from "react";
import { CATEGORIES, CATEGORY_KEYS, type Sponsor, categoryLabel } from "@/lib/fanfit-score";
import { type SponsorInput, addSponsor, findSponsorsOnWeb, importSponsors, removeSponsor, updateSponsor } from "../actions";

export interface ListedSponsor {
  id: string;
  name: string;
  category: string;
  tier: string;
  source_url: string | null;
}

const GROUP_LABEL: Record<string, string> = {
  alcohol: "Alcohol", beverage: "Drinks", food: "Food", finance: "Finance", health: "Health", automotive: "Automotive",
  travel: "Travel", gaming: "Betting & gaming", fashion: "Apparel & fashion", home_outdoor: "Home & outdoor", tech: "Tech",
  energy_utilities: "Energy & utilities", services: "Services", retail: "Retail", other: "Other",
};
const GROUPS = [...new Set(Object.values(CATEGORIES))];
const field = "w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm outline-none focus:border-accent";

function CategorySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={field} aria-label="Category">
      <option value="">Category…</option>
      {GROUPS.map((g) => (
        <optgroup key={g} label={GROUP_LABEL[g] ?? g}>
          {CATEGORY_KEYS.filter((c) => CATEGORIES[c] === g).map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

const empty: SponsorInput = { name: "", category: "", tier: "", sourceUrl: "" };

function SponsorForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial: SponsorInput;
  submitLabel: string;
  onSubmit: (s: SponsorInput) => Promise<{ error?: string } | { ok: boolean }>;
  onCancel?: () => void;
}) {
  const [s, setS] = useState(initial);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await onSubmit(s);
          if ("error" in r && r.error) setError(r.error);
          else {
            setError("");
            if (!onCancel) setS(empty);
            onCancel?.();
          }
        });
      }}
      className="grid gap-2 sm:grid-cols-[1.4fr_1.2fr_1fr_1.2fr_auto]"
    >
      <input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} placeholder="Sponsor name" aria-label="Sponsor name" maxLength={120} className={field} />
      <CategorySelect value={s.category} onChange={(category) => setS({ ...s, category })} />
      <input value={s.tier} onChange={(e) => setS({ ...s, tier: e.target.value })} placeholder="Tier, e.g. jersey" aria-label="Tier" maxLength={80} className={field} />
      <input value={s.sourceUrl} onChange={(e) => setS({ ...s, sourceUrl: e.target.value })} placeholder="Link (optional)" aria-label="Source link" className={field} />
      <div className="flex gap-2">
        <button disabled={pending || !s.name.trim() || !s.category} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50">
          {pending ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-full border border-line px-3 py-2 text-sm text-muted">
            Cancel
          </button>
        )}
      </div>
      {error && <p className="text-sm text-loss sm:col-span-5">{error}</p>}
    </form>
  );
}

export default function SponsorList({ sponsors }: { sponsors: ListedSponsor[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-line bg-panel/90 p-6">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Listed ({sponsors.length})</p>
        {sponsors.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing listed yet, so FanFit falls back to web search. Add sponsors below or import them.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {sponsors.map((s) => (
              <li key={s.id} className="py-3">
                {editing === s.id ? (
                  <SponsorForm
                    initial={{ name: s.name, category: s.category, tier: s.tier, sourceUrl: s.source_url ?? "" }}
                    submitLabel="Save"
                    onSubmit={(v) => updateSponsor(s.id, v)}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {s.source_url ? (
                          <a href={s.source_url} target="_blank" rel="noreferrer" className="hover:text-accent">
                            {s.name}
                          </a>
                        ) : (
                          s.name
                        )}
                      </p>
                      <p className="text-xs text-muted">
                        {categoryLabel(s.category)}
                        {s.tier ? ` · ${s.tier}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditing(s.id)} className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:border-accent hover:text-text">
                        Edit
                      </button>
                      <button
                        disabled={pending}
                        onClick={() => start(() => removeSponsor(s.id))}
                        className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:border-loss hover:text-loss disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-3xl border border-line bg-panel/90 p-6">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Add a sponsor</p>
        <div className="mt-3">
          <SponsorForm initial={empty} submitLabel="Add" onSubmit={addSponsor} />
        </div>
      </section>

      <WebImport />
    </div>
  );
}

function WebImport() {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<(Sponsor & { pick: boolean })[]>([]);
  const [saving, start] = useTransition();
  const [imported, setImported] = useState<number | null>(null);

  async function find() {
    setState("loading");
    setError("");
    setImported(null);
    const r = await findSponsorsOnWeb();
    if ("error" in r && r.error) {
      setError(r.error);
      setState("idle");
    } else {
      setRows(("candidates" in r ? r.candidates ?? [] : []).map((c) => ({ ...c, pick: true })));
      setState("done");
    }
  }

  const picked = rows.filter((r) => r.pick);
  return (
    <section className="rounded-3xl border border-line bg-panel/90 p-6">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Import from web search</p>
      <p className="mt-1 text-sm text-muted">
        FanFit searches recent news and team pages for your current sponsors. Check each one before importing: search can miss
        deals or list old ones.
      </p>
      {state !== "done" && (
        <button onClick={find} disabled={state === "loading"} className="mt-3 rounded-full border border-accent px-4 py-2 text-sm font-semibold text-accent disabled:opacity-60">
          {state === "loading" ? "Searching… (~30–60 s)" : "Find sponsors on the web"}
        </button>
      )}
      {error && <p className="mt-2 text-sm text-loss">{error}</p>}
      {state === "done" &&
        (rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing new found beyond your list.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {rows.map((r, i) => (
              <div key={r.name} className="grid items-center gap-2 text-sm sm:grid-cols-[auto_1.4fr_1.2fr_1fr]">
                <input
                  type="checkbox"
                  checked={r.pick}
                  onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, pick: e.target.checked } : x)))}
                  aria-label={`Import ${r.name}`}
                />
                <span>
                  {r.sourceUrl ? (
                    <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="hover:text-accent">
                      {r.name} ↗
                    </a>
                  ) : (
                    r.name
                  )}
                </span>
                <CategorySelect value={r.category} onChange={(category) => setRows(rows.map((x, j) => (j === i ? { ...x, category: category as Sponsor["category"] } : x)))} />
                <span className="truncate text-xs text-muted">{r.tier}</span>
              </div>
            ))}
            <button
              disabled={saving || picked.length === 0}
              onClick={() =>
                start(async () => {
                  const res = await importSponsors(picked.map((p) => ({ name: p.name, category: p.category, tier: p.tier, sourceUrl: p.sourceUrl })));
                  if ("error" in res && res.error) setError(res.error);
                  else {
                    setImported(picked.length);
                    setRows([]);
                  }
                })
              }
              className="mt-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50"
            >
              {saving ? "Importing…" : `Import ${picked.length} sponsor${picked.length === 1 ? "" : "s"}`}
            </button>
          </div>
        ))}
      {imported !== null && <p className="mt-2 text-sm text-gain">Imported {imported}. They are on your list above.</p>}
    </section>
  );
}
