"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import QRCode from "qrcode";
import "leaflet/dist/leaflet.css";
import { AGES, AGE_LABEL } from "@/lib/fanfit-score";
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
}

const STORE = "fanfit-claims"; // offer id -> code, kept in this browser only
const CHANGED = "fanfit-claims-changed";

// Claimed codes live in localStorage; read through useSyncExternalStore so the server render (no storage) and the
// first client render agree, and other tabs' claims show up too.
function readStore() {
  try {
    return localStorage.getItem(STORE) ?? "{}";
  } catch {
    return "{}";
  }
}
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}
function saveCode(offerId: string, code: string) {
  try {
    localStorage.setItem(STORE, JSON.stringify({ ...JSON.parse(readStore()), [offerId]: code }));
  } catch {
    // private mode: nothing persists, the code is still shown for this visit via the fallback below
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** Great-circle distance in km. */
function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export default function FanOffers({ offers, teamName }: { offers: FanOffer[]; teamName: string }) {
  const [here, setHere] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState<"idle" | "busy" | "denied">("idle");
  const [selected, setSelected] = useState<string | null>(null);
  const stored = useSyncExternalStore(subscribe, readStore, () => "{}");
  const [unsaved, setUnsaved] = useState<Record<string, string>>({}); // when storage is unavailable
  const codes = useMemo(() => ({ ...unsaved, ...(JSON.parse(stored) as Record<string, string>) }), [stored, unsaved]);

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

  if (offers.length === 0)
    return <p className="rounded-2xl border border-line bg-panel p-6 text-muted">{teamName} has no live offers right now. Check back soon.</p>;

  return (
    <div className="space-y-4">
      <OfferMap offers={offers} here={here} selected={selected} onSelect={setSelected} />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button onClick={nearMe} disabled={locating === "busy"} className="rounded-full border border-accent px-4 py-1.5 font-semibold text-accent disabled:opacity-50">
          {locating === "busy" ? "Locating…" : here ? "Sorted by distance" : "Near me"}
        </button>
        <span className="text-xs text-muted">
          {locating === "denied" ? "Location is off; sorted by fit instead." : "Your location stays on this device."}
        </span>
      </div>
      <ol className="space-y-3">
        {sorted.map((o) => (
          <OfferCard
            key={o.offer_id}
            o={o}
            distance={here && o.lat !== null && o.lon !== null ? km(here, { lat: o.lat, lon: o.lon }) : null}
            highlighted={selected === o.offer_id}
            code={codes[o.offer_id]}
            onCode={(code) => {
              setUnsaved((u) => ({ ...u, [o.offer_id]: code }));
              saveCode(o.offer_id, code);
            }}
          />
        ))}
      </ol>
    </div>
  );
}

function OfferMap({
  offers,
  here,
  selected,
  onSelect,
}: {
  offers: FanOffer[];
  here: { lat: number; lon: number } | null;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const layer = useRef<import("leaflet").LayerGroup | null>(null);
  const placed = useMemo(() => offers.filter((o) => o.lat !== null && o.lon !== null), [offers]);

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
      const gain = getComputedStyle(document.documentElement).getPropertyValue("--gain").trim() || "#5fe0c1";
      const points: [number, number][] = [];
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
  }, [placed, here, selected, onSelect]);

  useEffect(() => () => void map.current?.remove(), []);

  if (placed.length === 0) return null;
  return <div ref={box} className="h-72 w-full overflow-hidden rounded-2xl border border-line sm:h-96" aria-label="Map of partner businesses" />;
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
    <li className={`rounded-2xl border bg-panel p-4 ${highlighted ? "border-accent" : "border-line"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">{o.place_name}</p>
        {distance !== null && <span className="font-mono text-xs text-muted">{distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`}</span>}
      </div>
      <p className="text-xs text-muted">
        {[o.category, o.address].filter(Boolean).join(" · ")}
      </p>
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
