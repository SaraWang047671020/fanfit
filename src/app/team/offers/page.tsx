import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AGES, AGE_LABEL } from "@/lib/fanfit-score";
import { currentUser } from "@/lib/supabase/server";
import AccountBar from "../../AccountBar";
import { CopyLink, OfferControls, SimulatedControls } from "./OfferControls";

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
}
interface Claim {
  offer_id: string;
  age_group: string | null;
  redeemed_at: string | null;
  simulated: boolean;
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "—");

export default async function TeamOffersPage({ searchParams }: PageProps<"/team/offers">) {
  const { supabase, user, profile } = await currentUser();
  if (!user) redirect("/login?next=/team/offers");
  if (profile?.role !== "team") redirect(profile?.role === "sponsor" ? "/sponsor" : "/onboarding");
  const { sim } = await searchParams;
  const showSim = sim === "1";

  const [{ data: team }, { data: offers }, { data: keys }, { data: claims }] = await Promise.all([
    supabase.from("teams").select("id, name").eq("id", profile.team_id!).single<{ id: string; name: string }>(),
    supabase.from("offers").select("id, place_name, address, title, fit, ends_on, active, lat, demo").order("created_at", { ascending: false }).returns<Offer[]>(),
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
  const counted = (claims ?? []).filter((c) => isDemo(c) === showSim);
  const redeemed = counted.filter((c) => c.redeemed_at);
  const byAge = AGES.map((a) => ({ a, n: counted.filter((c) => c.age_group === a).length }));
  const maxAge = Math.max(1, ...byAge.map((x) => x.n));

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <AccountBar name={profile.display_name ?? user.email ?? ""} org={team?.name ?? "Your team"} role="team" />
      <header className="mt-6">
        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/fanfit" className="text-muted hover:text-text">← Sponsor finder</Link>
          <Link href="/team/sponsors" className="text-muted hover:text-text">Your sponsors</Link>
        </div>
        <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-gain">Fan map offers</p>
        <h1 className="mt-2 text-4xl font-bold">Offers, claims and redemptions</h1>
        <p className="mt-3 max-w-3xl text-muted">
          Offers from partner businesses appear on your public fan map. Fans claim a code, staff redeem it with the business&apos;s
          redemption link, and the results land here next to the fit FanFit predicted. Add offers from the Local businesses tab
          of the sponsor finder.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted">Your fan map:</span>
          <a href={fanUrl} target="_blank" rel="noreferrer" className="text-accent">
            {fanUrl} ↗
          </a>
          <CopyLink url={fanUrl} label="Copy link" />
        </div>
      </header>

      <section className="mt-8 rounded-3xl border border-line bg-panel/90 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">
            Results {showSim && <span className="ml-2 rounded-full border border-warn px-2 py-0.5 text-warn normal-case tracking-normal">demo and simulated data</span>}
          </p>
          <div className="flex gap-3 text-xs">
            <Link href="/team/offers" className={!showSim ? "text-text" : "text-muted hover:text-text"}>Real</Link>
            <Link href="/team/offers?sim=1" className={showSim ? "text-text" : "text-muted hover:text-text"}>Demo</Link>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <Tile label="Live offers" value={String((offers ?? []).filter((o) => o.active).length)} />
          <Tile label="Codes claimed" value={String(counted.length)} />
          <Tile label="Redeemed" value={String(redeemed.length)} />
          <Tile label="Redemption rate" value={pct(redeemed.length, counted.length)} />
        </div>
        <div className="mt-6">
          <p className="text-sm font-semibold">Claims by age group</p>
          <p className="text-xs text-muted">Self-reported by fans when they claim (optional), so the bars can add up to less than the total.</p>
          <div className="mt-3 space-y-1.5">
            {byAge.map(({ a, n }) => (
              <div key={a} className="grid grid-cols-[3.5rem_1fr_2.5rem] items-center gap-3 text-xs" title={`${AGE_LABEL[a]}: ${n} claims`}>
                <span className="text-muted">{AGE_LABEL[a]}</span>
                <div className="h-2.5 rounded-full bg-panel-2">
                  <div className="h-2.5 rounded-r-[4px] bg-gain" style={{ width: `${(100 * n) / maxAge}%` }} />
                </div>
                <span className="text-right font-mono">{n}</span>
              </div>
            ))}
          </div>
        </div>
        {showSim && (
          <p className="mt-4 text-xs text-warn">
            Demo data: claims on demo offers (not agreed with the business) and simulated claims, which are random and unrelated to fit.
            It shows how the dashboard reads, not whether FanFit&apos;s predictions work.
          </p>
        )}
        <div className="mt-4">
          <SimulatedControls hasSimulated={hasSim} />
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-line bg-panel/90 p-6">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Offers</p>
        {(offers ?? []).length === 0 && (
          <p className="mt-3 text-sm text-muted">
            No offers yet. Run the <Link href="/fanfit" className="text-accent">sponsor finder</Link>, open Local businesses and use
            “+ Fan map offer” on a business you have agreed a deal with.
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
                        {o.demo && <span className="ml-2 rounded-full border border-warn px-2 py-0.5 text-[10px] font-semibold text-warn">DEMO</span>}
                      </p>
                      <p className="text-xs text-muted">{o.title}{o.ends_on ? ` · until ${o.ends_on}` : ""}</p>
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

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel-2 p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
