import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AGES, AGE_LABEL } from "@/lib/fanfit-score";
import { placePredictions } from "@/lib/predictions";
import { currentUser } from "@/lib/supabase/server";
import AccountBar from "../../AccountBar";
import { PredictedInfo } from "../../Explain";
import { CopyLink, OfferControls, SimulatedControls } from "./OfferControls";
import PageHeader from "../../PageHeader";
import SectionIcon from "@/app/SectionIcon";
import { ChartColumn, Crosshair, Ticket } from "lucide-react";

export const metadata: Metadata = { title: "FanFit · Offers and fan map" };

interface Offer {
  id: string;
  place_name: string;
  address: string;
  title: string;
  fit: number | null;
  ends_on: string | null;
  active: boolean;
  lat: number | null;
  demo: boolean;
  place_qloo_id: string;
}
interface Claim {
  offer_id: string;
  age_group: string | null;
  redeemed_at: string | null;
  simulated: boolean;
}

const MIN_AGED = 10; // claims with a self-reported age before an offer's prediction is judged
const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "—");

export default async function TeamOffersPage({ searchParams }: PageProps<"/team/offers">) {
  const { supabase, user, profile } = await currentUser();
  if (!user) redirect("/login?next=/team/offers");
  if (profile?.role !== "team") redirect(profile?.role === "sponsor" ? "/sponsor" : "/onboarding");
  if (!profile.team_approved) redirect("/fanfit"); // pending: the fanfit page explains
  const { sim } = await searchParams;

  const [{ data: team }, { data: offers }, { data: keys }, { data: claims }] = await Promise.all([
    supabase.from("teams").select("id, name, city").eq("id", profile.team_id!).single<{ id: string; name: string; city: string }>(),
    supabase
      .from("offers")
      .select("id, place_name, address, title, fit, ends_on, active, lat, demo, place_qloo_id")
      .order("created_at", { ascending: false })
      .returns<Offer[]>(),
    supabase.from("offer_keys").select("offer_id, redeem_key").returns<{ offer_id: string; redeem_key: string }[]>(),
    supabase.from("claims").select("offer_id, age_group, redeemed_at, simulated").returns<Claim[]>(),
  ]);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const fanUrl = `${origin}/t/${team?.id}`;
  const keyOf = new Map((keys ?? []).map((k) => [k.offer_id, k.redeem_key]));
  const hasSim = (claims ?? []).some((c) => c.simulated);
  // Demo tab: simulated claims plus every claim on a demo offer (the business never agreed to it). Real tab: the rest.
  const demoOffers = new Set((offers ?? []).filter((o) => o.demo).map((o) => o.id));
  const isDemo = (c: Claim) => c.simulated || demoOffers.has(c.offer_id);
  // With no real claims yet, open on the Demo tab so the page does not read as all zeros; ?sim=0 forces the Real tab.
  const noReal = !(claims ?? []).some((c) => !isDemo(c));
  const showSim = sim === "1" || (sim !== "0" && noReal && (claims ?? []).length > 0);
  const counted = (claims ?? []).filter((c) => isDemo(c) === showSim);
  const redeemed = counted.filter((c) => c.redeemed_at);
  const byAge = AGES.map((a) => ({ a, n: counted.filter((c) => c.age_group === a).length }));
  const maxAge = Math.max(1, ...byAge.map((x) => x.n));

  // Predicted vs actual: the age group FanFit expected each business to draw, against who claimed its deal.
  const predictions = team ? await placePredictions(team.name, team.city) : null;
  const checks = (offers ?? [])
    .filter((o) => o.active || counted.some((c) => c.offer_id === o.id)) // skip paused offers nobody claimed
    .map((o) => {
      const p = predictions?.byPlace.get(o.place_qloo_id) ?? null;
      const aged = counted.filter((c) => c.offer_id === o.id && c.age_group);
      const n = (a: string) => aged.filter((c) => c.age_group === a).length;
      const top = aged.length ? AGES.reduce((best, a) => (n(a) > n(best) ? a : best), AGES[0]) : null;
      const share = p && aged.length ? n(p.driver) / aged.length : null;
      // Lift over the fan base: 1x = the predicted group claimed only its share of the team's fans.
      const lift = p && share !== null ? share / predictions!.mix[p.driver] : null;
      return { o, p, aged: aged.length, top, share, lift };
    });
  const judged = checks.filter((c) => c.p && c.aged >= MIN_AGED);
  const hits = judged.filter((c) => (c.lift ?? 0) > 1).length;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <AccountBar name={profile.display_name ?? user.email ?? ""} org={team?.name ?? "Your team"} role="team" tour="team-offers" />
      <PageHeader side="team" icon="ticket" photo="/images/cafe.jpg" eyebrow={<>Fan map offers</>} title={<>Offers, claims and redemptions</>}>
        <p className="mt-3 max-w-3xl text-muted">
          Offers from partner businesses appear on your public fan map. Fans claim a code, staff redeem it with the business&apos;s
          redemption link, and the results land here next to the fit FanFit predicted. Add offers from the Local businesses tab of the
          sponsor finder.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted">Your fan map:</span>
          <a href={fanUrl} target="_blank" rel="noreferrer" className="text-accent">
            {fanUrl} ↗
          </a>
          <CopyLink url={fanUrl} label="Copy link" />
        </div>
      </PageHeader>

      <section data-tour="offer-results" className="mt-8 rounded-3xl border border-line bg-panel/90 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-accent">
            <SectionIcon icon={ChartColumn} tone="gain" />
            Results{" "}
            {showSim && (
              <span className="ml-2 rounded-full border border-warn px-2 py-0.5 text-warn normal-case tracking-normal">
                demo and simulated data
              </span>
            )}
          </p>
          <div data-tour="offer-tabs" className="flex gap-3 text-xs">
            <Link href="/team/offers?sim=0" className={!showSim ? "text-text" : "text-muted hover:text-text"}>
              Real
            </Link>
            <Link href="/team/offers?sim=1" className={showSim ? "text-text" : "text-muted hover:text-text"}>
              Demo
            </Link>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <Tile label="Live offers" value={String((offers ?? []).filter((o) => o.active).length)} tone="bg-team" />
          <Tile label="Codes claimed" value={String(counted.length)} tone="bg-brand" />
          <Tile label="Redeemed" value={String(redeemed.length)} tone="bg-gain" />
          <Tile label="Redemption rate" value={pct(redeemed.length, counted.length)} tone="bg-sun" />
        </div>
        <div className="mt-6">
          <p className="text-sm font-semibold">Claims by age group</p>
          <p className="text-xs text-muted">
            Self-reported by fans when they claim (optional), so the bars can add up to less than the total.
          </p>
          <div className="mt-3 space-y-1.5">
            {byAge.map(({ a, n }) => (
              <div key={a} className="grid grid-cols-[3.5rem_1fr_2.5rem] items-center gap-3 text-xs" title={`${AGE_LABEL[a]}: ${n} claims`}>
                <span className="text-muted">{AGE_LABEL[a]}</span>
                <div className="h-3 rounded-full bg-panel-2">
                  <div className="h-3 rounded-full bg-gradient-to-r from-team to-gain" style={{ width: `${(100 * n) / maxAge}%` }} />
                </div>
                <span className="text-right font-mono">{n}</span>
              </div>
            ))}
          </div>
        </div>
        {showSim && (
          <p className="mt-4 text-xs text-warn">
            Demo data: claims on demo offers (not agreed with the business) and simulated claims, which are random and unrelated to fit. It
            shows how the dashboard reads, not whether FanFit&apos;s predictions work.
          </p>
        )}
        <div className="mt-4">
          {!profile.is_demo && <SimulatedControls hasSimulated={hasSim} />}
        </div>
      </section>

      <section data-tour="offer-predicted" className="mt-6 rounded-3xl border border-line bg-panel/90 p-6">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-accent">
          <SectionIcon icon={Crosshair} tone="brand" />
          Predicted vs actual <PredictedInfo />
        </p>
        <p className="mt-1 max-w-3xl text-xs text-muted">
          For each business, the fan age group FanFit expected it to draw most (from the sponsor finder) next to who actually claimed its
          deal. Lift compares the predicted group&apos;s share of claims with its share of your fan base: above 1× means the prediction
          pulled in more of those fans than chance would.
        </p>
        {!predictions ? (
          <p className="mt-4 text-sm text-muted">
            Run the{" "}
            <Link href="/fanfit" className="text-accent">
              sponsor finder
            </Link>{" "}
            to record predictions for your local businesses.
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm">
              {showSim ? (
                // Simulated claims pick ages at random: a hit rate or lift here would read as a (bad) result. Shown on real data only.
                <span className="text-muted">
                  Demo data: simulated claims pick an age at random, so only the predictions are shown here. Share and lift appear on the
                  Real tab once fans claim real offers.
                </span>
              ) : judged.length ? (
                <>
                  <span className="font-semibold">
                    {hits} of {judged.length}
                  </span>{" "}
                  offers drew more of their predicted age group than its share of your fans.
                </>
              ) : (
                <span className="text-muted">Not enough claims with an age yet (at least {MIN_AGED} per offer) to judge a prediction.</span>
              )}
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="py-2 pr-3 font-normal">Business</th>
                    <th className="py-2 pr-3 font-normal">FanFit predicted</th>
                    <th className="py-2 pr-3 font-normal">Most claims from</th>
                    {!showSim && <th className="py-2 pr-3 text-right font-normal">Predicted group&apos;s share</th>}
                    {!showSim && <th className="py-2 text-right font-normal">Lift</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {checks.map(({ o, p, aged, top, share, lift }) => (
                    <tr key={o.id}>
                      <td className="py-2.5 pr-3 font-semibold">{o.place_name}</td>
                      <td className="py-2.5 pr-3">{p ? AGE_LABEL[p.driver] : <span className="text-muted">not in the analysis</span>}</td>
                      <td className="py-2.5 pr-3">
                        {top ? (
                          <span className={!showSim && p && top === p.driver ? "font-semibold text-gain" : ""}>
                            {AGE_LABEL[top as keyof typeof AGE_LABEL]}
                          </span>
                        ) : (
                          <span className="text-muted">no claims with an age</span>
                        )}
                      </td>
                      {!showSim && (
                        <>
                          <td className="py-2.5 pr-3 text-right font-mono">
                            {share === null ? "—" : `${Math.round(share * 100)}%`}
                            <span className="ml-1 text-xs text-muted">of {aged}</span>
                          </td>
                          <td
                            className={`py-2.5 text-right font-mono ${lift === null || aged < MIN_AGED ? "text-muted" : lift > 1 ? "text-gain" : "text-loss"}`}
                          >
                            {lift === null ? "—" : aged < MIN_AGED ? "too few" : `${lift.toFixed(1)}×`}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section data-tour="offer-list" className="mt-6 rounded-3xl border border-line bg-panel/90 p-6">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-accent"><SectionIcon icon={Ticket} tone="sun" /> Offers</p>
        {(offers ?? []).length === 0 && (
          <p className="mt-3 text-sm text-muted">
            No offers yet. Run the{" "}
            <Link href="/fanfit" className="text-accent">
              sponsor finder
            </Link>
            , open Local businesses and use “+ Fan map offer” on a business you have agreed a deal with.
          </p>
        )}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-2 pr-3 font-normal">Business and offer</th>
                <th className="py-2 pr-3 text-right font-normal">FanFit fit</th>
                <th className="py-2 pr-3 text-right font-normal">Claimed</th>
                <th className="py-2 pr-3 text-right font-normal">Redeemed</th>
                <th className="py-2 pr-3 text-right font-normal">Rate</th>
                <th className="py-2 font-normal">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(offers ?? []).map((o) => {
                const c = counted.filter((x) => x.offer_id === o.id);
                const r = c.filter((x) => x.redeemed_at).length;
                return (
                  <tr key={o.id} className={o.active ? "" : "opacity-60"}>
                    <td className="py-3 pr-3">
                      <p className="font-semibold">
                        {o.place_name}
                        {o.demo && (
                          <span className="ml-2 rounded-full border border-warn px-2 py-0.5 text-[10px] font-semibold text-warn">DEMO</span>
                        )}
                      </p>
                      <p className="text-xs text-muted">
                        {o.title}
                        {o.ends_on ? ` · until ${o.ends_on}` : ""}
                      </p>
                      {o.lat === null && <p className="text-xs text-warn">No coordinates from Qloo: listed but not on the map.</p>}
                    </td>
                    <td className="py-3 pr-3 text-right font-mono">{o.fit ?? "—"}</td>
                    <td className="py-3 pr-3 text-right font-mono">{c.length}</td>
                    <td className="py-3 pr-3 text-right font-mono">{r}</td>
                    <td className="py-3 pr-3 text-right font-mono">{pct(r, c.length)}</td>
                    <td className="py-3">
                      <OfferControls offerId={o.id} active={o.active} redeemUrl={`${origin}/redeem/${o.id}?k=${keyOf.get(o.id) ?? ""}`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          Give each business its own redemption link (it works like a password: anyone with it can redeem codes for that offer).
        </p>
      </section>
    </main>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-panel p-4 pl-5">
      <span className={`absolute inset-y-0 left-0 w-1.5 ${tone}`} aria-hidden />
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight">{value}</p>
    </div>
  );
}
