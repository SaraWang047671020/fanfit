"use client";

// "Put an offer on the fan map" for a recommended local business. The offer goes live on the team's public fan page.
import Link from "next/link";
import { useState, useTransition } from "react";
import type { FitRow } from "@/lib/fanfit-score";
import { createOffer } from "../team/actions";

export default function OfferButton({ row }: { row: FitRow }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("15% off with a match ticket");
  const [details, setDetails] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [result, setResult] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [pending, start] = useTransition();

  if (result?.ok)
    return (
      <p className="mt-3 text-xs text-gain">
        Offer is live on your fan map. <Link href="/team/offers" className="underline">Manage offers →</Link>
      </p>
    );
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="mt-3 ml-2 rounded-full border border-accent px-3 py-1 text-xs font-semibold text-accent">
        + Fan map offer
      </button>
    );

  const field = "mt-1 w-full rounded-lg border border-line bg-panel px-3 py-1.5 text-sm outline-none focus:border-accent";
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-accent/40 bg-bg/60 p-3 text-xs">
      <p className="font-semibold">Offer from {row.name} on your fan map</p>
      <label className="block">
        <span className="text-muted">Offer (what fans get)</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className={field} />
      </label>
      <label className="block">
        <span className="text-muted">Details (optional)</span>
        <input value={details} onChange={(e) => setDetails(e.target.value)} maxLength={300} placeholder="e.g. dine-in only, one per visit" className={field} />
      </label>
      <label className="block">
        <span className="text-muted">Ends on (optional)</span>
        <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className={field} />
      </label>
      <p className="text-muted">Agree the offer with the business first. It goes live on your public fan page right away.</p>
      <div className="flex gap-2">
        <button
          disabled={pending || title.trim().length < 3}
          onClick={() => start(async () => setResult(await createOffer({ placeId: row.id, title, details, endsOn, fit: row.score })))}
          className="rounded-full bg-accent px-3 py-1 font-semibold text-bg disabled:opacity-50"
        >
          {pending ? "Publishing…" : "Publish offer"}
        </button>
        <button onClick={() => setOpen(false)} className="rounded-full border border-line px-3 py-1 text-muted">
          Cancel
        </button>
      </div>
      {result?.error && <p className="text-loss">{result.error}</p>}
    </div>
  );
}
