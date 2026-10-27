import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { DecideButtons } from "../team/RequestButtons";

export const metadata: Metadata = { title: "FanFit · Admin", robots: { index: false } };

interface Request {
  user_id: string;
  email: string;
  display_name: string | null;
  team_id: string;
  team_name: string;
  requested_at: string;
}

/** Team access requests across all teams. Admins only (profiles.is_admin, set in SQL); others get a 404. */
export default async function AdminPage() {
  const { supabase, user, profile } = await currentUser();
  if (!user || !profile?.is_admin) notFound();
  const { data } = await supabase.rpc("team_requests");
  const requests = (data ?? []) as Request[];
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-gain">FanFit admin</p>
      <h1 className="mt-2 text-3xl font-bold">Team access requests</h1>
      <p className="mt-3 text-muted">
        Approve someone only when you can tell they work for the club (for example a club email address, or you know them).
        Teammates who are already approved can also approve their own colleagues.
      </p>
      <section className="mt-8 rounded-3xl border border-line bg-panel/90 p-6">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Pending ({requests.length})</p>
        {requests.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing waiting.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {requests.map((r) => (
              <li key={r.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold">{r.team_name}</p>
                  <p className="text-xs text-muted">
                    {r.email}
                    {r.display_name ? ` · ${r.display_name}` : ""} · asked {new Date(r.requested_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
                <DecideButtons userId={r.user_id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
