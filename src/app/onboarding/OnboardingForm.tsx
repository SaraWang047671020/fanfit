"use client";

import { useState, useTransition } from "react";
import { SPONSOR_CATEGORIES } from "@/lib/fanfit-score";
import { type BrandOption, createSponsor, findBrands, joinTeam } from "./actions";

export interface TeamOption {
  id: string;
  name: string;
  league: string;
  city: string;
}

export default function OnboardingForm({ teams }: { teams: TeamOption[] }) {
  const [role, setRole] = useState<"team" | "sponsor" | null>(null);
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <RoleCard
          active={role === "team"}
          onClick={() => setRole("team")}
          title="A team"
          body="Find brands and local businesses your fans already love, with a reason to call each one now."
        />
        <RoleCard
          active={role === "sponsor"}
          onClick={() => setRole("sponsor")}
          title="A brand / sponsor"
          body="See which teams' fans love your brand, and which of them still have your category open."
        />
      </div>
      {role === "team" && <TeamStep teams={teams} />}
      {role === "sponsor" && <SponsorStep />}
    </div>
  );
}

function RoleCard({ active, onClick, title, body }: { active: boolean; onClick: () => void; title: string; body: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-2xl border p-5 text-left ${active ? "border-accent bg-panel-2" : "border-line bg-panel hover:border-accent/60"}`}
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </button>
  );
}

function TeamStep({ teams }: { teams: TeamOption[] }) {
  const [teamId, setTeamId] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const leagues = [...new Set(teams.map((t) => t.league))];
  return (
    <section className="rounded-2xl border border-line bg-panel p-6">
      <label className="block">
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Your team</span>
        <select
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          className="mt-2 w-full rounded-xl border border-line bg-panel-2 px-4 py-2.5 text-sm outline-none focus:border-accent"
        >
          <option value="">Choose…</option>
          {leagues.map((lg) => (
            <optgroup key={lg} label={lg}>
              {teams
                .filter((t) => t.league === lg)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.city}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <p className="mt-2 text-xs text-muted">Teams Qloo has no taste data for are not listed yet.</p>
      <button
        disabled={!teamId || pending}
        onClick={() => start(async () => setError((await joinTeam(teamId))?.error ?? ""))}
        className="mt-4 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-bg disabled:opacity-50"
      >
        {pending ? "Saving…" : "Continue"}
      </button>
      {error && <p className="mt-3 text-sm text-loss">{error}</p>}
    </section>
  );
}

function SponsorStep() {
  const [name, setName] = useState("");
  const [options, setOptions] = useState<BrandOption[] | null>(null);
  const [brand, setBrand] = useState<BrandOption | null>(null);
  const [cats, setCats] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [searching, startSearch] = useTransition();
  const [saving, startSave] = useTransition();

  return (
    <section className="space-y-5 rounded-2xl border border-line bg-panel p-6">
      <div>
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Your brand</span>
        <div className="mt-2 flex gap-2">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setBrand(null);
              setOptions(null);
            }}
            maxLength={80}
            className="w-full rounded-xl border border-line bg-panel-2 px-4 py-2.5 text-sm outline-none focus:border-accent"
          />
          <button
            disabled={name.trim().length < 2 || searching}
            onClick={() =>
              startSearch(async () => {
                const found = await findBrands(name);
                const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
                setOptions(found);
                // Preselect the same-name brand (else the top hit): unlinked sponsors get no team ranking.
                setBrand(found.find((o) => norm(o.name) === norm(name)) ?? found[0] ?? null);
              })
            }
            className="shrink-0 rounded-full border border-accent px-4 text-sm font-semibold text-accent disabled:opacity-50"
          >
            {searching ? "Looking…" : "Find in Qloo"}
          </button>
        </div>
        {options && (
          <div className="mt-3 space-y-1.5 text-sm">
            <p className="text-xs text-muted">Pick your brand so FanFit can read its fans&apos; taste:</p>
            {options.map((o) => (
              <label key={o.id} className="flex cursor-pointer items-baseline gap-2">
                <input type="radio" name="brand" checked={brand?.id === o.id} onChange={() => setBrand(o)} />
                <span>{o.name}</span>
                <span className="text-xs text-muted">{o.category}</span>
              </label>
            ))}
            <label className="flex cursor-pointer items-baseline gap-2">
              <input type="radio" name="brand" checked={brand === null} onChange={() => setBrand(null)} />
              <span className="text-muted">None of these (team matching needs a Qloo brand; you can add it later)</span>
            </label>
          </div>
        )}
      </div>
      <div>
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Categories you sponsor in</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {SPONSOR_CATEGORIES.map((c) => {
            const on = cats.includes(c.key);
            return (
              <button
                key={c.key}
                aria-pressed={on}
                onClick={() => setCats(on ? cats.filter((x) => x !== c.key) : [...cats, c.key])}
                className={`rounded-full border px-3 py-1 text-xs ${on ? "border-accent bg-accent text-bg" : "border-line text-muted hover:text-text"}`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">Used to show which teams already have a sponsor in your category.</p>
      </div>
      <button
        disabled={!name.trim() || cats.length === 0 || saving}
        onClick={() => startSave(async () => setError((await createSponsor(brand?.name ?? name, brand?.id ?? null, cats))?.error ?? ""))}
        className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-bg disabled:opacity-50"
      >
        {saving ? "Saving…" : "Continue"}
      </button>
      {error && <p className="text-sm text-loss">{error}</p>}
    </section>
  );
}
