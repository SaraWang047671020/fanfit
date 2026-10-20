"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import "leaflet/dist/leaflet.css";
import { type SavedCode, useSavedCodes } from "@/lib/fan-codes";
import { AGES, AGE_LABEL, categoryLabel } from "@/lib/fanfit-score";
import { createClient } from "@/lib/supabase/client";

export interface FanOffer {
  offer_id: string;
  title: string;
  details: string;
  place_name: string;
  address: string;
  lat: number | null;
  lon: number | null;
  category: string;
  fit: number | null;
  ends_on: string | null;
  team_id?: string; // set on cross-team lists (deals near me)
  team_name?: string;
}

/** A sponsor on the club's list. Shown on the fan map whether or not it has an offer; pinned when it has a location. */
export interface Partner {
  name: string;
  category: string;
  tier: string;
  source_url: string | null;
  address: string;
  lat: number | null;
  lon: number | null;
}

const norm = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
/** The offer from this partner's business, if any (offers are tied to places, partners to the club's list). */
const offerOf = (p: Partner, offers: FanOffer[]) =>
  offers.find((o) => norm(o.place_name).includes(norm(p.name)) || norm(p.name).includes(norm(o.place_name)));

/** Great-circle distance in km. */
function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export default function FanOffers({ offers, partners = [], emptyText }: { offers: FanOffer[]; partners?: Partner[]; emptyText: string }) {
  const [here, setHere] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState<"idle" | "busy" | "denied">("idle");
  const [selected, setSelected] = useState<string | null>(null);
  const { codes, remember } = useSavedCodes();

  const sorted = useMemo(() => {
    if (!here) return offers; // already ordered by fit
    const d = (o: FanOffer) => (o.lat === null || o.lon === null ? Infinity : km(here, { lat: o.lat, lon: o.lon }));
    return [...offers].sort((a, b) => d(a) - d(b));
  }, [offers, here]);

  function nearMe() {
    setLocating("busy");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setHere({ lat: p.coords.latitude, lon: p.coords.longitude });
        setLocating("idle");
      },
      () => setLocating("denied"),
      { timeout: 10_000 },
    );
  }

  if (offers.length === 0 && partners.length === 0)
    return <p className="rounded-2xl border border-line bg-panel p-6 text-muted">{emptyText}</p>;

  const select = (id: string) => {
    setSelected(id);
    document.getElementById(`offer-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="space-y-4">
      <OfferMap offers={offers} partners={partners} here={here} selected={selected} onSelect={select} />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button onClick={nearMe} disabled={locating === "busy"} className="rounded-full border border-accent px-4 py-1.5 font-semibold text-accent disabled:opacity-50">
          {locating === "busy" ? "Locating…" : here ? "Sorted by distance" : "Near me"}
        </button>
        <span className="text-xs text-muted">
          {locating === "denied" ? "Location is off; sorted by fit instead." : "Your location stays on this device."}
        </span>
      </div>
      {offers.length === 0 && <p className="rounded-2xl border border-line bg-panel p-4 text-sm text-muted">{emptyText}</p>}
      <ol className="space-y-3">
        {sorted.map((o) => (
          <OfferCard
            key={o.offer_id}
            o={o}
            distance={here && o.lat !== null && o.lon !== null ? km(here, { lat: o.lat, lon: o.lon }) : null}
            highlighted={selected === o.offer_id}
            code={codes[o.offer_id]?.code}
            onCode={(code) =>
              remember(o.offer_id, {
                code,
                title: o.title,
                place_name: o.place_name,
                team_id: o.team_id,
                team_name: o.team_name,
                ends_on: o.ends_on,
                claimed_at: new Date().toISOString(),
              } satisfies SavedCode)
            }
          />
        ))}
      </ol>
      {partners.length > 0 && <Partners partners={partners} offers={offers} onDeal={select} />}
    </div>
  );
}

function Partners({ partners, offers, onDeal }: { partners: Partner[]; offers: FanOffer[]; onDeal: (offerId: string) => void }) {
  return (
    <section className="pt-4">
      <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Official partners</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {partners.map((p) => {
          const deal = offerOf(p, offers);
          return (
            <li key={p.name} className="rounded-2xl border border-line bg-panel px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {p.source_url ? (
                      <a href={p.source_url} target="_blank" rel="noreferrer" className="hover:text-accent">
                        {p.name}
                      </a>
                    ) : (
                      p.name
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {categoryLabel(p.category)}
                    {p.tier ? ` · ${p.tier}` : ""}
                  </p>
                  {p.address && <p className="text-xs text-muted">📍 {p.address}</p>}
                </div>
                {deal && (
                  <button onClick={() => onDeal(deal.offer_id)} className="shrink-0 rounded-full bg-gain/15 px-2.5 py-1 text-xs font-semibold text-gain">
                    Deal
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function OfferMap({
  offers,
  partners,
  here,
  selected,
  onSelect,
}: {
  offers: FanOffer[];
  partners: Partner[];
  here: { lat: number; lon: number } | null;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const layer = useRef<import("leaflet").LayerGroup | null>(null);
  const placed = useMemo(() => offers.filter((o) => o.lat !== null && o.lon !== null), [offers]);
  // Partners already shown through their offer get no second pin.
  const pinnedPartners = useMemo(() => partners.filter((p) => p.lat !== null && p.lon !== null && !offerOf(p, offers)), [partners, offers]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet"); // touches window, so load it in the browser only
      if (cancelled || !box.current) return;
      if (!map.current) {
        map.current = L.map(box.current, { scrollWheelZoom: false });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map.current);
        layer.current = L.layerGroup().addTo(map.current);
      }
      layer.current!.clearLayers();
      const css = getComputedStyle(document.documentElement);
      const gain = css.getPropertyValue("--gain").trim() || "#5fe0c1";
      const accent = css.getPropertyValue("--accent").trim() || "#8fa4ff";
      const points: [number, number][] = [];
      for (const p of pinnedPartners) {
        const pt: [number, number] = [p.lat!, p.lon!];
        points.push(pt);
        L.circleMarker(pt, { radius: 7, color: accent, weight: 3, fillColor: "#0b0d12", fillOpacity: 1 })
          .bindTooltip(`${p.name} · official partner`)
          .addTo(layer.current!);
      }
      for (const o of placed) {
        const pt: [number, number] = [o.lat!, o.lon!];
        points.push(pt);
        L.circleMarker(pt, { radius: o.offer_id === selected ? 10 : 7, color: "#0b0d12", weight: 2, fillColor: gain, fillOpacity: 1 })
          .bindTooltip(`${o.place_name}: ${o.title}`)
          .on("click", () => onSelect(o.offer_id))
          .addTo(layer.current!);
      }
      if (here) {
        points.push([here.lat, here.lon]);
        L.circleMarker([here.lat, here.lon], { radius: 6, color: "#ffffff", weight: 2, fillColor: "#8fa4ff", fillOpacity: 1 })
          .bindTooltip("You")
          .addTo(layer.current!);
      }
      if (points.length) map.current.fitBounds(L.latLngBounds(points).pad(0.2), { maxZoom: 15 });
    })();
    return () => {
      cancelled = true;
    };
  }, [placed, pinnedPartners, here, selected, onSelect]);

  useEffect(() => () => void map.current?.remove(), []);

  if (placed.length === 0 && pinnedPartners.length === 0) return null;
  return (
    <div>
      <div ref={box} className="h-72 w-full overflow-hidden rounded-2xl border border-line sm:h-96" aria-label="Map of partner businesses and deals" />
      <p className="mt-2 flex gap-4 text-xs text-muted">
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-gain align-middle" />Deal</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full border-2 border-accent align-middle" />Official partner</span>
      </p>
    </div>
  );
}

function OfferCard({
  o,
  distance,
  highlighted,
  code,
  onCode,
}: {
  o: FanOffer;
  distance: number | null;
  highlighted: boolean;
  code?: string;
  onCode: (code: string) => void;
}) {
  const [age, setAge] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [qr, setQr] = useState("");
  useEffect(() => {
    if (code) QRCode.toDataURL(code, { margin: 1, width: 160 }).then(setQr, () => setQr(""));
  }, [code]);

  async function claim() {
    setState("busy");
    const { data, error } = await createClient().rpc("claim_offer", { p_offer: o.offer_id, p_age: age || null });
    if (error || typeof data !== "string") return setState("error");
    setState("idle");
    onCode(data);
  }

  return (
    <li id={`offer-${o.offer_id}`} className={`scroll-mt-20 rounded-2xl border bg-panel p-4 ${highlighted ? "border-accent" : "border-line"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">{o.place_name}</p>
        {distance !== null && <span className="font-mono text-xs text-muted">{distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`}</span>}
      </div>
      <p className="text-xs text-muted">
        {[o.category, o.address].filter(Boolean).join(" · ")}
      </p>
      {o.team_name && o.team_id && (
        <a href={`/t/${o.team_id}`} className="mt-1 inline-block text-xs text-accent">
          {o.team_name} partner
        </a>
      )}
      <p className="mt-2 text-lg font-semibold text-gain">{o.title}</p>
      {o.details && <p className="text-sm text-muted">{o.details}</p>}
      {o.ends_on && <p className="mt-1 text-xs text-muted">Until {o.ends_on}</p>}
      {code ? (
        <div className="mt-3 flex items-center gap-4 rounded-xl border border-gain/50 bg-bg/60 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL generated in the browser */}
          {qr && <img src={qr} alt={`QR code for ${code}`} width={96} height={96} className="rounded bg-white p-1" />}
          <div>
            <p className="text-xs text-muted">Show this at the counter</p>
            <p className="font-mono text-3xl font-bold tracking-[0.2em]">{code}</p>
            <p className="text-xs text-muted">One use. Saved on this device.</p>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <select value={age} onChange={(e) => setAge(e.target.value)} aria-label="Your age group (optional)" className="rounded-full border border-line bg-panel-2 px-3 py-1.5 text-xs">
            <option value="">Age (optional)</option>
            {AGES.map((a) => (
              <option key={a} value={a}>
                {AGE_LABEL[a]}
              </option>
            ))}
          </select>
          <button onClick={claim} disabled={state === "busy"} className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-bg disabled:opacity-50">
            {state === "busy" ? "Getting code…" : "Get code"}
          </button>
          {state === "error" && <span className="text-xs text-loss">This offer is no longer available.</span>}
        </div>
      )}
    </li>
  );
}
