"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const callback = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await createClient().auth.signInWithOtp({ email, options: { emailRedirectTo: callback() } });
    if (error) {
      setState("error");
      setMessage(error.message);
    } else setState("sent");
  }

  async function google() {
    const { error } = await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback() } });
    if (error) {
      setState("error");
      setMessage(error.message);
    }
  }

  if (state === "sent")
    return (
      <div className="rounded-2xl border border-line bg-panel p-6 text-sm">
        <p className="font-semibold">Check your email</p>
        <p className="mt-2 text-muted">We sent a sign-in link to {email}. Open it on this device to continue.</p>
      </div>
    );

  return (
    <div className="space-y-6">
      <button
        onClick={google}
        className="w-full rounded-full border border-line bg-panel-2 px-6 py-2.5 text-sm font-semibold hover:border-accent"
      >
        Continue with Google
      </button>
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <form onSubmit={sendLink} className="space-y-3">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 w-full rounded-xl border border-line bg-panel-2 px-4 py-2.5 text-sm outline-none focus:border-accent"
          />
        </label>
        <button
          type="submit"
          disabled={state === "sending"}
          className="w-full rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-bg disabled:opacity-50"
        >
          {state === "sending" ? "Sending…" : "Email me a sign-in link"}
        </button>
      </form>
      {state === "error" && <p className="text-sm text-loss">{message}</p>}
    </div>
  );
}
