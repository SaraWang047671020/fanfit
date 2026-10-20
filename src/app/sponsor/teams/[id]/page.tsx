import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AGES, AGE_LABEL, SPONSOR_CATEGORIES } from "@/lib/fanfit-score";
import { type Audience, audience, sharedAge, sharedTaste, sharedTraits } from "@/lib/sponsor-detail";
import { type DirectoryTeam, teamFit } from "@/lib/sponsor-fit";
import { fitBand } from "@/lib/sponsor-fit-band";
import { currentUser } from "@/lib/supabase/server";
import AccountBar from "../../../AccountBar";
import { FitInfo } from "../../../Explain";
import Tabs from "../../../Tabs";
import InterestCard, { type SentNote } from "./InterestCard";
import TeamActions from "./TeamActions";

export const metadata: Metadata = { title: "FanFit · Team detail" };

interface SponsorRow {
  name: string;
  qloo_id: string | null;
  categories: string[];
}

export default async function SponsorTeamPage({ params }: PageProps<"/sponsor/teams/[id]">) {
  const { id } = await params;
  const { supabase, user, profile } = await currentUser();
  if (!user) redirect(`/login?next=/sponsor/teams/${id}`);
  if (profile?.role !== "sponsor") redirect(profile?.role === "team" ? "/fanfit" : "/onboarding");

  const [{ data: sponsor }, { data: teams }, { data: listed }, { data: sent }] = await Promise.all([
    supabase.from("sponsors").select("name, qloo_id, categories").eq("id", profile.sponsor_id!).single<SponsorRow>(),
    supabase.from("teams").select("id, name, league, city, qloo_id, fit_mean, fit_sd, claimed_at").returns<DirectoryTeam[]>(),
    supabase.from("team_sponsors").select("name, category").eq("team_id", id).returns<{ name: string; category: string }[]>(),
    supabase.from("sponsor_interest").select("status, created_at, message, report:pitch_reports(token, views)").eq("team_id", id).maybeSingle<SentNote>(),
  ]);
  const team = teams?.find((t) => t.id === id);
  if (!team || !sponsor) notFound();
  if (!sponsor.qloo_id) redirect("/sponsor");

  const fits = await teamFit(sponsor.qloo_id, teams!);
  const rank = fits.findIndex((f) => f.team.id === id) + 1;
  const z = fits[rank - 1]?.z ?? null;
  const covered = new Set<string>(SPONSOR_CATEGORIES.filter((c) => sponsor.categories.includes(c.key)).flatMap((c) => c.covers));
  const audiences = Promise.all([audience(team.qloo_id), audience(sponsor.qloo_id)]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <AccountBar name={profile.display_name ?? user.email ?? ""} org={sponsor.name} role="sponsor" tour="sponsor-team" />
      <Link href="/sponsor" className="mt-6 inline-block text-sm text-muted hover:text-text">
        ← All teams
      </Link>
      <header className="mt-3">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-gain">
          {team.league} · {team.city}
          {team.claimed_at && <span className="ml-2 rounded-full border border-gain px-2 py-0.5 text-[10px]">on FanFit</span>}
        </p>
        <h1 className="mt-2 text-4xl font-bold">
          {team.name} × {sponsor.name}
        </h1>
        <p data-tour="fit" className="mt-3 text-muted">
          <span className="font-semibold text-text">{fitBand(z)} fit</span>
          {z !== null && ` (${z >= 0 ? "+" : ""}${z.toFixed(1)}σ above how these fans like the typical big brand)`} · #{rank} of {fits.length} teams
          for {sponsor.name}.
          <FitInfo brand={sponsor.name} />
        </p>
      </header>

      <div className="mt-6">
        <InterestCard
          teamId={team.id}
          teamName={team.name}
          brand={sponsor.name}
          onFanfit={!!team.claimed_at}
          sent={sent}
          email={user.email ?? ""}
        />
      </div>
      <div className="mt-8">
        <Tabs
          tour="detail-tabs"
          tabs={[
            {
              key: "audience",
              label: "Audience fit",
              content: (
                <div className="grid gap-6 lg:grid-cols-2">
                  <Suspense fallback={<Loading title="Their fans vs your customers" />}>
                    <Audiences teamName={team.name} brandName={sponsor.name} data={audiences} />
                  </Suspense>
                  <Suspense fallback={<Loading title="Shared brand traits" />}>
                    <Traits teamQloo={team.qloo_id} brandQloo={sponsor.qloo_id} brandName={sponsor.name} />
                  </Suspense>
                </div>
              ),
            },
            {
              key: "taste",
              label: "What fans of both love",
              content: (
                <Suspense fallback={<Loading title="What fans of both love" />}>
                  <Shared teamQloo={team.qloo_id} brandQloo={sponsor.qloo_id} city={team.city} teamName={team.name} brandName={sponsor.name} />
                </Suspense>
              ),
            },
            {
              key: "act",
              label: "Sponsors, timing & activation",
              content: (
                <Suspense fallback={<Loading title="Sponsors, timing and an activation idea" />}>
                  <ActionsWithAge
                    data={audiences}
                    team={{ id: team.id, qloo: team.qloo_id, name: team.name, city: team.city }}
                    brand={{ qloo: sponsor.qloo_id, name: sponsor.name }}
                    listed={(listed ?? []).map((s) => ({ ...s, mine: covered.has(s.category) }))}
                  />
                </Suspense>
              ),
            },
          ]}
        />
      </div>
    </main>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-panel/90 p-6">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">{title}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Loading({ title }: { title: string }) {
  return (
    <Panel title={title}>
      <p className="animate-pulse text-sm text-muted">Asking Qloo…</p>
    </Panel>
  );
}

async function Audiences({ teamName, brandName, data }: { teamName: string; brandName: string; data: Promise<(Audience | null)[]> }) {
  const [team, brand] = await data;
  if (!team || !brand) return <Panel title="Their fans vs your customers"><p className="text-sm text-muted">Qloo has no audience data for one of the two.</p></Panel>;
  const best = sharedAge(team, brand);
  const bar = (v: number) => (
    <div className="relative h-2 rounded-full bg-panel-2">
      <div className="absolute top-0 h-2 w-px bg-line" style={{ left: "50%" }} />
      <div
        className={`absolute top-0 h-2 rounded-full ${v >= 0 ? "bg-gain" : "bg-loss/70"}`}
        style={v >= 0 ? { left: "50%", width: `${Math.min(50, v * 50)}%` } : { right: "50%", width: `${Math.min(50, -v * 50)}%` }}
      />
    </div>
  );
  const lean = (g: Audience["gender"]) => (Math.abs(g.male - g.female) < 0.1 ? "balanced" : g.female > g.male ? "lean female" : "lean male");
  return (
    <Panel title="Their fans vs your customers" hint="Qloo's relative over- (right) or under-representation (left) by age; centre = average.">
      <div className="grid grid-cols-[3.5rem_1fr_1fr] gap-x-3 gap-y-2 text-xs">
        <span />
        <span className="truncate font-semibold">{teamName} fans</span>
        <span className="truncate font-semibold">{brandName} customers</span>
        {AGES.map((a) => (
          <div key={a} className="contents">
            <span className={a === best ? "font-semibold text-gain" : "text-muted"}>{AGE_LABEL[a]}</span>
            {bar(team.age[a])}
            {bar(brand.age[a])}
          </div>
        ))}
        <span className="text-muted">Gender</span>
        <span>{lean(team.gender)}</span>
        <span>{lean(brand.gender)}</span>
      </div>
      <p className="mt-4 text-sm">
        Strongest overlap: <span className="font-semibold text-gain">{AGE_LABEL[best]}</span>. Activations should aim here first.
      </p>
    </Panel>
  );
}

async function Traits({ teamQloo, brandQloo, brandName }: { teamQloo: string; brandQloo: string; brandName: string }) {
  const traits = await sharedTraits(teamQloo, brandQloo);
  return (
    <Panel title="Shared brand traits" hint={`Qloo tags the team and ${brandName} both carry: what a joint campaign can stand on.`}>
      {traits.length === 0 ? (
        <p className="text-sm text-muted">No tags in common. The fit comes from the fans, not from a shared image.</p>
      ) : (
        <dl className="space-y-2 text-sm">
          {traits.map((t) => (
            <div key={t.kind} className="flex flex-wrap items-baseline gap-2">
              <dt className="w-20 shrink-0 text-xs text-muted">{t.kind}</dt>
              {t.tags.map((x) => (
                <dd key={x} className="rounded-full border border-line px-2 py-0.5 text-xs">
                  {x}
                </dd>
              ))}
            </div>
          ))}
        </dl>
      )}
    </Panel>
  );
}

async function Shared(p: { teamQloo: string; brandQloo: string; city: string; teamName: string; brandName: string }) {
  const s = await sharedTaste(p.teamQloo, p.brandQloo, p.city);
  const col = (title: string, items: { id: string; name: string; detail: string }[]) => (
    <div>
      <p className="text-xs font-semibold text-muted">{title}</p>
      <ol className="mt-2 space-y-1 text-sm">
        {items.map((it, i) => (
          <li key={it.id} className="flex items-baseline gap-2">
            <span className="w-4 font-mono text-xs text-muted">{i + 1}</span>
            <span>{it.name}</span>
            {it.detail && <span className="truncate text-xs text-muted">{it.detail}</span>}
          </li>
        ))}
        {items.length === 0 && <li className="text-xs text-muted">Nothing from Qloo.</li>}
      </ol>
    </div>
  );
  return (
    <Panel
      title="What fans of both love"
      hint={`Ranked by Qloo for people who like both ${p.teamName} and ${p.brandName}, in ${p.city}: material for co-promotions, halftime acts and venues.`}
    >
      <div className="grid gap-6 sm:grid-cols-3">
        {col("Brands", s.brands)}
        {col("Artists", s.artists)}
        {col(`Places in ${p.city}`, s.places)}
      </div>
    </Panel>
  );
}

async function ActionsWithAge(p: {
  data: Promise<(Audience | null)[]>;
  team: { id: string; qloo: string; name: string; city: string };
  brand: { qloo: string; name: string };
  listed: { name: string; category: string; mine: boolean }[];
}) {
  const [team, brand] = await p.data;
  return <TeamActions team={p.team} brand={p.brand} listed={p.listed} driver={sharedAge(team, brand)} />;
}
