"use client";

import { useState, useTransition } from "react";
import { clearSimulated, setOfferActive, simulateClaims } from "../actions";

export function CopyLink({ url, label }: { url: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:border-accent hover:text-text"
    >
      {done ? "Copied" : label}
    </button>
  );
}

export function OfferControls({ offerId, active, redeemUrl }: { offerId: string; active: boolean; redeemUrl: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <CopyLink url={redeemUrl} label="Copy redemption link" />
      <button
        disabled={pending}
        onClick={() => start(() => setOfferActive(offerId, !active))}
        className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:border-accent hover:text-text disabled:opacity-50"
      >
        {active ? "Pause" : "Resume"}
      </button>
      <button
        disabled={pending}
        onClick={() => start(async () => void (await simulateClaims(offerId)))}
        title="Adds 40 random claims flagged as simulated"
        className="rounded-full border border-warn/60 px-3 py-1 text-xs text-warn disabled:opacity-50"
      >
        + Simulated claims
      </button>
    </div>
  );
}

export function SimulatedControls({ hasSimulated }: { hasSimulated: boolean }) {
  const [pending, start] = useTransition();
  if (!hasSimulated) return null;
  return (
    <button
      disabled={pending}
      onClick={() => start(() => clearSimulated())}
      className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-text disabled:opacity-50"
    >
      Delete all simulated claims
    </button>
  );
}
