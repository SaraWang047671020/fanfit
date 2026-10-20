"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { useSavedCodes } from "@/lib/fan-codes";
import { createClient } from "@/lib/supabase/client";

export interface AccountClaim {
  offer_id: string;
  code: string;
  claimed_at: string;
  redeemed_at: string | null;
  title: string;
  place_name: string;
  address: string;
  ends_on: string | null;
  active: boolean;
  team_id: string;
  team_name: string;
}

type Status = "unused" | "used" | "expired" | "unknown";
interface Coupon {
  offerId: string;
  code: string;
  title: string;
  place: string;
  teamId?: string;
  teamName?: string;
  endsOn: string | null;
  status: Status;
}

const today = () => new Date().toISOString().slice(0, 10);
const STATUS: Record<Status, { label: string; tone: string }> = {
  unused: { label: "Ready to use", tone: "text-gain border-gain/60" },
  used: { label: "Used", tone: "text-muted border-line" },
  expired: { label: "Expired", tone: "text-muted border-line" },
  unknown: { label: "Not found", tone: "text-warn border-warn/60" },
};

export default function MyCoupons({ signedIn, account }: { signedIn: boolean; account: AccountClaim[] }) {
  const router = useRouter();
  const { codes } = useSavedCodes();
  const [deviceStatus, setDeviceStatus] = useState<Record<string, Status>>({});
  const [open, setOpen] = useState<string | null>(null);

  // Signed in: hand codes claimed on this device (before signing in) to the account, then reload the account list.
  useEffect(() => {
    if (!signedIn) return;
    const owned = new Set(account.map((c) => `${c.offer_id}:${c.code}`));
    const items = Object.entries(codes)
      .filter(([offer, s]) => !owned.has(`${offer}:${s.code}`))
      .map(([offer, s]) => ({ offer, code: s.code }));
    if (!items.length) return;
    createClient()
      .rpc("attach_claims", { p_items: items })
      .then(({ data }) => {
        if (typeof data === "number" && data > 0) router.refresh();
      });
  }, [signedIn, account, codes, router]);

  // Signed out: ask whether each device code has been used (knowing the code is the proof).
  useEffect(() => {
    if (signedIn) return;
    const supabase = createClient();
    for (const [offer, s] of Object.entries(codes)) {
      supabase.rpc("claim_status", { p_offer: offer, p_code: s.code }).then(({ data }) => {
        if (typeof data === "string") setDeviceStatus((d) => ({ ...d, [`${offer}:${s.code}`]: data as Status }));
      });
    }
  }, [signedIn, codes]);

  const coupons: Coupon[] = useMemo(() => {
    const fromAccount: Coupon[] = account.map((c) => ({
      offerId: c.offer_id,
      code: c.code,
      title: c.title,
      place: c.place_name,
      teamId: c.team_id,
      teamName: c.team_name,
      endsOn: c.ends_on,
      status: c.redeemed_at ? "used" : (c.ends_on && c.ends_on < today()) || !c.active ? "expired" : "unused",
    }));
    const inAccount = new Set(fromAccount.map((c) => `${c.offerId}:${c.code}`));
    const fromDevice: Coupon[] = Object.entries(codes)
      .filter(([offer, s]) => !inAccount.has(`${offer}:${s.code}`) && !signedIn)
      .map(([offer, s]) => {
        const st = deviceStatus[`${offer}:${s.code}`] ?? "unused";
        return {
          offerId: offer,
          code: s.code,
          title: s.title || "Offer",
          place: s.place_name,
          teamId: s.team_id,
          teamName: s.team_name,
          endsOn: s.ends_on,
          status: st === "unused" && s.ends_on && s.ends_on < today() ? "expired" : st,
        };
      });
    const order: Status[] = ["unused", "unknown", "used", "expired"];
    return [...fromAccount, ...fromDevice].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  }, [account, codes, deviceStatus, signedIn]);

  if (coupons.length === 0)
    return (
      <div className="rounded-2xl border border-line bg-panel p-6 text-sm text-muted">
        No coupons yet. <Link href="/fans" className="text-accent">Find your team</Link> or see{" "}
        <Link href="/fans/near" className="text-accent">deals near you</Link>.
      </div>
    );

  return (
    <ul className="space-y-3">
      {coupons.map((c) => {
        const key = `${c.offerId}:${c.code}`;
        return (
          <li key={key} className={`rounded-2xl border bg-panel p-4 ${c.status === "unused" ? "border-line" : "border-line opacity-60"}`}>
            <button className="w-full text-left" onClick={() => setOpen(open === key ? null : key)} disabled={c.status !== "unused"}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gain">{c.title}</p>
                  <p className="text-sm">{c.place}</p>
                  <p className="text-xs text-muted">
                    {c.teamName ? `${c.teamName} partner` : ""}
                    {c.endsOn ? `${c.teamName ? " · " : ""}until ${c.endsOn}` : ""}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${STATUS[c.status].tone}`}>{STATUS[c.status].label}</span>
              </div>
              <p className="mt-2 font-mono text-2xl font-bold tracking-[0.2em]">{c.code}</p>
              {c.status === "unused" && <p className="text-xs text-muted">{open === key ? "Tap to hide" : "Tap to show the QR code"}</p>}
            </button>
            {open === key && <Qr code={c.code} />}
          </li>
        );
      })}
    </ul>
  );
}

function Qr({ code }: { code: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(code, { margin: 1, width: 240 }).then(setSrc, () => setSrc(""));
  }, [code]);
  if (!src) return null;
  return (
    <div className="mt-3 flex justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- data URL generated in the browser */}
      <img src={src} alt={`QR code for ${code}`} width={200} height={200} className="rounded-lg bg-white p-2" />
    </div>
  );
}
