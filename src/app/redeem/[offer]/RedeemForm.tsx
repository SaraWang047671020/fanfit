"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MESSAGES: Record<string, { tone: string; text: string }> = {
  ok: { tone: "text-gain", text: "Redeemed. Give the fan the offer." },
  used: { tone: "text-warn", text: "This code was already used." },
  invalid: { tone: "text-loss", text: "No such code for this offer. Check the letters." },
  denied: { tone: "text-loss", text: "This redemption link is not valid. Ask the team for a new one." },
};

export default function RedeemForm({ offer, redeemKey }: { offer: string; redeemKey: string }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await createClient().rpc("redeem_claim", { p_offer: offer, p_key: redeemKey, p_code: code });
    setBusy(false);
    setResult(error ? "invalid" : String(data));
    if (data === "ok") setCode("");
  }

  const msg = result ? MESSAGES[result] ?? MESSAGES.invalid : null;
  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        aria-label="Fan code"
        placeholder="ABC234"
        className="w-full rounded-xl border border-line bg-panel-2 px-4 py-3 text-center font-mono text-3xl tracking-[0.3em] outline-none focus:border-accent"
      />
      <button type="submit" disabled={busy || code.length !== 6} className="w-full rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-bg disabled:opacity-50">
        {busy ? "Checking…" : "Redeem"}
      </button>
      {msg && <p className={`text-center text-sm font-semibold ${msg.tone}`}>{msg.text}</p>}
    </form>
  );
}
