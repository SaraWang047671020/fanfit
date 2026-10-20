"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FollowButton } from "./FanButtons";

export interface FanTeam {
  id: string;
  name: string;
  league: string;
  city: string;
  live_offers: number;
}

export default function TeamSearch({ teams, followed, signedInAs }: { teams: FanTeam[]; followed: string[]; signedInAs: string | null }) {
  const [q, setQ] = useState("");
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const matches = useMemo(() => teams.filter((t) => norm(`${t.name} ${t.city} ${t.league}`).includes(norm(q.trim()))), [teams, q]);
  const mine = teams.filter((t) => followed.includes(t.id));
  const withDeals = teams.filter((t) => t.live_offers > 0);
  const leagues = [...new Set(teams.map((t) => t.league))].sort();

  return (
    <div className="space-y-8">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search a team or city"
        aria-label="Search a team or city"
        className="w-full rounded-full border border-line bg-panel-2 px-5 py-3 text-base outline-none focus:border-accent"
      />
      {q.trim() ? (
        <Section title={`${matches.length} result${matches.length === 1 ? "" : "s"}`}>
          <Teams followed={followed} signedInAs={signedInAs} teams={matches} />
        </Section>
      ) : (
        <>
          {mine.length > 0 && (
            <Section title="Your teams">
              <Teams followed={followed} signedInAs={signedInAs} teams={mine} />
            </Section>
          )}
          <Section title="Teams with deals now">
            {withDeals.length ? <Teams followed={followed} signedInAs={signedInAs} teams={withDeals} /> : <p className="text-sm text-muted">No team has live deals yet. Check back soon.</p>}
          </Section>
          {leagues.map((lg) => (
            <details key={lg} className="group">
              <summary className="cursor-pointer list-none text-sm font-semibold text-muted group-open:text-text">
                {lg} <span className="text-xs font-normal">({teams.filter((t) => t.league === lg).length} teams) ▾</span>
              </summary>
              <div className="mt-3">
                <Teams followed={followed} signedInAs={signedInAs} teams={teams.filter((t) => t.league === lg)} />
              </div>
            </details>
          ))}
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-accent">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Teams({ teams, followed, signedInAs }: { teams: FanTeam[]; followed: string[]; signedInAs: string | null }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {teams.map((t, i) => (
        <li key={t.id} data-tour={i === 0 ? "heart" : undefined} className="flex items-center gap-2">
          <FollowButton teamId={t.id} teamName={t.name} following={followed.includes(t.id)} signedInAs={signedInAs} compact next="/fans" />
          <Link
            href={`/t/${t.id}`}
            className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-2xl border border-line bg-panel px-4 py-3 hover:border-accent"
          >
            <span className="min-w-0">
              <span className="block truncate font-semibold">{t.name}</span>
              <span className="block text-xs text-muted">
                {t.league} · {t.city}
              </span>
            </span>
            {t.live_offers > 0 ? (
              <span className="shrink-0 rounded-full bg-gain/15 px-2.5 py-1 text-xs font-semibold text-gain">
                {t.live_offers} deal{t.live_offers === 1 ? "" : "s"}
              </span>
            ) : (
              <span className="shrink-0 text-xs text-muted">No deals yet</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
