"use client";

// "Your taste": brands, music, movies and shows a fan likes. Each kind has a tab of Qloo suggestions (what fans of
// their teams like) to tap, plus a search. Deals are then ordered for them.
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { Taste, TasteKind } from "@/lib/fan-taste";
import { findTastes, setTaste } from "./actions";

const TABS: { kind: TasteKind; label: string; search: string }[] = [
  { kind: "brand", label: "Brands", search: "Search brands" },
  { kind: "artist", label: "Music", search: "Search artists" },
  { kind: "movie", label: "Movies", search: "Search movies" },
  { kind: "tv_show", label: "TV shows", search: "Search shows" },
];
const KIND: Record<TasteKind, string> = { brand: "brand", artist: "artist", movie: "movie", tv_show: "TV show" };
const MAX = 8;

export default function TastePicker({
  tastes,
  suggestions,
  basis,
}: {
  tastes: Taste[];
  suggestions: Record<TasteKind, Taste[]>;
  basis: string; // whose favourites the suggestions are, e.g. "Seattle Sounders FC fans"
}) {
  const router = useRouter();
  const [open, setOpen] = useState(tastes.length < 3); // set up: collapsed to the chosen chips
  const [tab, setTab] = useState<TasteKind>("brand");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Taste[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const chosen = new Set(tastes.map((t) => t.entity_id));
  const full = tastes.length >= MAX;

  // Search as you type, after a pause: each search is a Qloo call.
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return;
    let live = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      const r = await findTastes(query, tab);
      if (!live) return;
      setSearching(false);
      setResults(r.results);
      setError(r.error ?? "");
    }, 450);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, tab]);

  const toggle = (t: Taste) => {
    const add = !chosen.has(t.entity_id);
    if (add && full) return setError(`You can keep up to ${MAX}. Remove one first.`);
    setBusy(t.entity_id);
    start(async () => {
      const r = await setTaste(t, add);
      setBusy(null);
      if (r.error) return setError(r.error);
      setError("");
      if (add) {
        setQ("");
        setResults([]);
      }
      router.refresh(); // re-rank the map for the new taste
    });
  };

  const chip = (t: Taste, withKind = false) => {
    const on = chosen.has(t.entity_id);
    return (
      <button
        key={t.entity_id}
        onClick={() => toggle(t)}
        disabled={busy !== null || (!on && full)}
        aria-pressed={on}
        className={`rounded-full border px-3 py-1.5 text-sm transition disabled:opacity-50 ${
          on ? "border-gain bg-gain text-white" : "border-line bg-panel-2 hover:border-gain hover:text-gain"
        } ${busy === t.entity_id ? "animate-pulse" : ""}`}
      >
        {on ? "✓ " : "+ "}
        {t.name}
        {withKind && <span className={`ml-1 text-[10px] ${on ? "text-white/80" : "text-muted"}`}>{KIND[t.kind]}</span>}
      </button>
    );
  };

  return (
    <section data-tour="taste" className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-accent">
          Your taste <span className="font-mono font-normal normal-case tracking-normal text-muted">{tastes.length}/{MAX}</span>
        </h2>
        <button onClick={() => setOpen(!open)} className="text-xs font-semibold text-accent">
          {open ? "Done" : tastes.length ? "Edit" : "Add"}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">Pick what you love; Qloo orders your teams&apos; deals for you. Private to you.</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {tastes.map((t) => chip(t, true))}
        {tastes.length === 0 && !open && <p className="text-sm text-muted">Nothing yet. Tap Add to pick a few.</p>}
      </div>

      {open && (
        <div className="mt-4 border-t border-line pt-4">
          <div role="tablist" aria-label="Kinds" className="flex flex-wrap gap-1 rounded-full bg-panel-2 p-1 text-sm sm:w-fit">
            {TABS.map((t) => (
              <button
                key={t.kind}
                role="tab"
                aria-selected={tab === t.kind}
                onClick={() => {
                  setTab(t.kind);
                  setQ("");
                  setResults([]);
                }}
                className={`flex-1 rounded-full px-4 py-1.5 font-semibold sm:flex-none ${tab === t.kind ? "bg-panel text-text shadow-sm" : "text-muted hover:text-text"}`}
              >
                {t.label}
                {tastes.some((x) => x.kind === t.kind) && <span className="ml-1 text-gain">•</span>}
              </button>
            ))}
          </div>

          <p className="mt-4 text-xs font-semibold text-muted">Popular with {basis}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions[tab].map((t) => chip(t))}
            {suggestions[tab].length === 0 && <p className="text-sm text-muted">No suggestions right now. Try the search.</p>}
          </div>

          <div className="relative mt-4">
            <input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                if (e.target.value.trim().length < 2) setResults([]);
              }}
              placeholder={`${TABS.find((t) => t.kind === tab)!.search}…`}
              aria-label={TABS.find((t) => t.kind === tab)!.search}
              className="w-full rounded-full border border-line bg-panel-2 px-4 py-2 text-sm outline-none focus:border-accent"
            />
            {q.trim().length >= 2 && (results.length > 0 || searching) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {searching && results.length === 0 && <p className="text-sm text-muted">Searching Qloo…</p>}
                {results.map((t) => chip(t))}
              </div>
            )}
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-loss">{error}</p>}
    </section>
  );
}
