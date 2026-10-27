"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { fitBand } from "@/lib/sponsor-fit-band";
import { Monogram } from "../Art";

export interface TeamRow {
  id: string;
  name: string;
  league: string;
  city: string;
  z: number | null;
  overallRank?: number; // with a target audience: the team's rank for all fans
  onFanfit: boolean;
  category: { status: "taken"; by: string[] } | { status: "open" } | { status: "unknown" };
}

const BAND_TONE: Record<string, string> = {
  Strong: "text-gain",
  Good: "text-gain/80",
  Average: "text-muted",
  Weak: "text-muted",
  "No data": "text-muted",
};

export default function TeamList({ rows, targeted = false, query = "" }: { rows: TeamRow[]; targeted?: boolean; query?: string }) {
  const leagues = useMemo(() => [...new Set(rows.map((r) => r.league))].sort(), [rows]);
  const [league, setLeague] = useState<string | null>(null);
  const [hideTaken, setHideTaken] = useState(true);
  const shown = rows.filter((r) => (!league || r.league === league) && !(hideTaken && r.category.status === "taken"));
  const max = Math.max(...rows.map((r) => r.z ?? 0), 1);

  return (
    <section className="rounded-3xl border border-line bg-panel/90 p-6">
      <div data-tour="filters" className="flex flex-wrap items-center gap-2 text-xs">
        {[null, ...leagues].map((lg) => (
          <button
            key={lg ?? "all"}
            onClick={() => setLeague(lg)}
            aria-pressed={league === lg}
            className={`rounded-full border px-3 py-1 ${league === lg ? "border-accent bg-accent text-bg" : "border-line text-muted hover:text-text"}`}
          >
            {lg ?? "All leagues"}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-muted">
          <input type="checkbox" checked={hideTaken} onChange={(e) => setHideTaken(e.target.checked)} />
          Hide teams with my category taken
        </label>
      </div>
      <ol className="mt-4 divide-y divide-line">
        {shown.map((r, i) => {
          const band = fitBand(r.z);
          const rank = rows.indexOf(r) + 1;
          const moved = targeted && r.overallRank ? r.overallRank - rank : 0;
          return (
            <li
              key={r.id}
              data-tour={i === 0 ? "team-row" : undefined}
              className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 py-3 text-sm sm:grid-cols-[2rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]"
            >
              <span className="font-mono text-xs text-muted">{i + 1}</span>
              <div className="flex min-w-0 items-center gap-3">
                <Monogram name={r.name} size="sm" />
                <div className="min-w-0">
                  <p className="font-semibold leading-snug sm:truncate">
                    <Link href={`/sponsor/teams/${r.id}${query}`} className="hover:text-accent">
                      {r.name}
                    </Link>
                    {r.onFanfit && (
                      <span className="ml-2 rounded-full border border-gain px-2 py-0.5 text-[10px] font-semibold text-gain">
                        on FanFit
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {r.league} · {r.city}
                    {moved !== 0 && (
                      <span
                        className={`ml-2 font-mono font-semibold ${moved > 0 ? "text-gain" : "text-loss"}`}
                        title={`#${r.overallRank} for all fans`}
                      >
                        {moved > 0 ? "▲" : "▼"}
                        {Math.abs(moved)}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="text-right sm:text-left">
                <p className={`text-xs font-semibold ${BAND_TONE[band]}`}>
                  {band}
                  {r.z !== null && (
                    <span className="ml-1 font-mono font-normal text-muted">
                      {r.z >= 0 ? "+" : ""}
                      {r.z.toFixed(1)}σ
                    </span>
                  )}
                </p>
                <div className="mt-1 hidden h-1.5 rounded-full bg-panel-2 sm:block">
                  <div className="h-1.5 rounded-full bg-gain" style={{ width: `${Math.max(0, ((r.z ?? 0) / max) * 100)}%` }} />
                </div>
              </div>
              <p className={`col-span-3 text-xs sm:col-span-1 ${r.category.status === "unknown" ? "hidden sm:block" : ""}`}>
                {r.category.status === "taken" ? (
                  <span className="text-loss">Category taken: {r.category.by.join(", ")}</span>
                ) : r.category.status === "open" ? (
                  <span className="text-gain">Category open</span>
                ) : (
                  <span className="text-muted">Sponsors not listed yet</span>
                )}
              </p>
            </li>
          );
        })}
      </ol>
      {shown.length === 0 && <p className="mt-4 text-sm text-muted">No teams match these filters.</p>}
      <p className="mt-4 text-xs text-muted">
        Open a team for why the fit is there, its current sponsors and an activation idea. Fit compares how much this team&apos;s fans like
        your brand with how they like 40 big brands (σ = standard deviations above their usual). Women&apos;s league teams have thinner Qloo
        data, so treat their scores as rougher. Category open or taken shows once a team lists its sponsors on FanFit.
      </p>
    </section>
  );
}
