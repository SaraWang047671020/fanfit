"use client";

// "Your taste": brands, artists, movies and shows a fan likes (Qloo search). Deals are then ordered for them.
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { Taste, TasteKind } from "@/lib/fan-taste";
import { findTastes, setTaste } from "./actions";

const KIND: Record<TasteKind, string> = { brand: "brand", artist: "artist", movie: "movie", tv_show: "TV show" };

export default function TastePicker({ tastes }: { tastes: Taste[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Taste[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const chosen = new Set(tastes.map((t) => t.entity_id));

  // Search as you type, after a pause: each search is a Qloo call.
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return;
    let live = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      const r = await findTastes(query);
      if (!live) return;
      setSearching(false);
      setResults(r.results);
      setError(r.error ?? "");
    }, 450);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q]);

  const change = (t: Taste, add: boolean) =>
    start(async () => {
      const r = await setTaste(t, add);
      if (r.error) return setError(r.error);
      setError("");
      if (add) {
        setQ("");
        setResults([]);
      }
      router.refresh(); // re-rank the map for the new taste
    });

  return (
    <section data-tour="taste" className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Your taste</h2>
        <p className="text-xs text-muted">Deals are ordered for you with Qloo. Private to you.</p>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {tastes.map((t) => (
          <li key={t.entity_id} className="flex items-center gap-1 rounded-full border border-line bg-panel-2 py-1 pl-3 pr-1 text-sm">
            {t.name}
            <span className="text-[10px] text-muted">{KIND[t.kind]}</span>
            <button
              disabled={pending}
              onClick={() => change(t, false)}
              aria-label={`Remove ${t.name}`}
              className="ml-1 h-6 w-6 rounded-full text-muted hover:bg-loss/10 hover:text-loss disabled:opacity-50"
            >
              ✕
            </button>
          </li>
        ))}
        {tastes.length === 0 && <li className="text-sm text-muted">Add a few brands, artists or shows you love.</li>}
      </ul>
      {tastes.length < 8 && (
        <div className="relative mt-3">
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              if (e.target.value.trim().length < 2) setResults([]);
            }}
            placeholder="Add a brand, artist, movie or show"
            aria-label="Add a taste"
            className="w-full rounded-full border border-line bg-panel-2 px-4 py-2 text-sm outline-none focus:border-accent"
          />
          {(results.length > 0 || searching) && q.trim().length >= 2 && (
            <ul className="absolute inset-x-0 top-full z-[1001] mt-1 max-h-72 overflow-auto rounded-xl border border-line bg-panel p-1 shadow-lg">
              {searching && results.length === 0 && <li className="px-3 py-2 text-sm text-muted">Searching Qloo…</li>}
              {results.map((r) => (
                <li key={r.entity_id}>
                  <button
                    disabled={pending || chosen.has(r.entity_id)}
                    onClick={() => change(r, true)}
                    className="flex w-full items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-panel-2 disabled:opacity-50"
                  >
                    <span>{r.name}</span>
                    <span className="text-xs text-muted">{chosen.has(r.entity_id) ? "added" : KIND[r.kind]}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-loss">{error}</p>}
    </section>
  );
}
