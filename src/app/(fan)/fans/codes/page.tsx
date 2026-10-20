import type { Metadata } from "next";
import { currentUser } from "@/lib/supabase/server";
import MyCoupons, { type AccountClaim } from "./MyCoupons";

export const metadata: Metadata = { title: "My coupons · FanFit" };

export default async function CodesPage() {
  const { supabase, user } = await currentUser();
  const { data } = user ? await supabase.rpc("my_claims") : { data: null };
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
      <h1 className="text-3xl font-bold">My coupons</h1>
      <p className="mt-2 text-muted">
        {user
          ? "Codes saved to your account, on any device. Tap one to show it at the counter."
          : "Codes claimed on this device. Sign in to keep them when you switch phones."}
      </p>
      <div className="mt-6">
        <MyCoupons signedIn={!!user} account={(data ?? []) as AccountClaim[]} />
      </div>
    </main>
  );
}
