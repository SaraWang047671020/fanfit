"use client";

// Codes a fan claimed on this device, in localStorage (no account needed). Read through useSyncExternalStore so the
// server render (no storage) and the first client render agree, and claims from other tabs show up too.
// Signed-in fans also have their codes in the database (my_claims); these get attached to the account on sign-in.
import { useMemo, useState, useSyncExternalStore } from "react";

export interface SavedCode {
  code: string;
  title: string;
  place_name: string;
  team_id?: string;
  team_name?: string;
  ends_on: string | null;
  claimed_at: string;
  demo?: boolean; // from a demo offer: not valid in store
}

const STORE = "fanfit-claims"; // offer id -> SavedCode (older entries: offer id -> code string)
const CHANGED = "fanfit-claims-changed";

function read() {
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

function parse(raw: string): Record<string, SavedCode> {
  try {
    const obj = JSON.parse(raw) as Record<string, SavedCode | string>;
    return Object.fromEntries(
      Object.entries(obj).map(([id, v]) => [id, typeof v === "string" ? { code: v, title: "", place_name: "", ends_on: null, claimed_at: "" } : v]),
    );
  } catch {
    return {};
  }
}

export function saveCode(offerId: string, saved: SavedCode) {
  try {
    localStorage.setItem(STORE, JSON.stringify({ ...JSON.parse(read()), [offerId]: saved }));
  } catch {
    // private mode: nothing persists; useSavedCodes keeps it for this visit
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** Codes saved on this device, plus ones claimed this visit when storage is unavailable. */
export function useSavedCodes() {
  const raw = useSyncExternalStore(subscribe, read, () => "{}");
  const [unsaved, setUnsaved] = useState<Record<string, SavedCode>>({});
  const codes = useMemo(() => ({ ...unsaved, ...parse(raw) }), [raw, unsaved]);
  const remember = (offerId: string, saved: SavedCode) => {
    setUnsaved((u) => ({ ...u, [offerId]: saved }));
    saveCode(offerId, saved);
  };
  return { codes, remember };
}
