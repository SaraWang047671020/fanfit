import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import AccountBar from "../../AccountBar";
import { DecideButtons } from "../RequestButtons";
import PageHeader from "../../PageHeader";
import SectionIcon from "@/app/SectionIcon";
import { UserPlus, Users } from "lucide-react";

export const metadata: Metadata = { title: "FanFit · Team members" };

interface Person {
  user_id: string;
  email: string;
  display_name: string | null;
}

export default async function TeamMembersPage() {
  const { supabase, user, profile } = await currentUser();
  if (!user) redirect("/login?next=/team/members");
  if (profile?.role !== "team") redirect(profile?.role === "sponsor" ? "/sponsor" : profile?.role === "fan" ? "/fans" : "/onboarding");
  if (!profile.team_approved) redirect("/fanfit");

  const [{ data: team }, { data: members }, { data: requests }] = await Promise.all([
    supabase.from("teams").select("name").eq("id", profile.team_id!).single<{ name: string }>(),
    supabase.rpc("team_members"),
    supabase.rpc("team_requests"),
  ]);
  const pending = (requests ?? []) as (Person & { requested_at: string })[];

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <AccountBar name={profile.display_name ?? user.email ?? ""} org={team?.name ?? "Your team"} role="team" />
      <PageHeader side="team" icon="users" eyebrow={<>Team members</>} title={<>Who can act for {team?.name}</>}>
        <p className="mt-3 max-w-3xl text-muted">
          Members can edit the sponsor list and fan map offers. Approve only people you know work for the club; anyone can ask to join.
        </p>
      </PageHeader>

      <section className="mt-8 rounded-3xl border border-line bg-panel/90 p-6">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-accent"><SectionIcon icon={UserPlus} tone="sun" /> Waiting for approval ({pending.length})</p>
        {pending.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No requests right now.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {pending.map((p) => (
              <li key={p.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold">{p.email}</p>
                  <p className="text-xs text-muted">
                    {p.display_name ? `${p.display_name} · ` : ""}asked {new Date(p.requested_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
                <DecideButtons userId={p.user_id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-3xl border border-line bg-panel/90 p-6">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-accent"><SectionIcon icon={Users} tone="team" /> Members ({(members ?? []).length})</p>
        <ul className="mt-3 divide-y divide-line">
          {((members ?? []) as Person[]).map((m) => (
            <li key={m.user_id} className="py-3 text-sm">
              <p className="font-semibold">
                {m.email}
                {m.user_id === user.id && <span className="ml-2 text-xs font-normal text-muted">(you)</span>}
              </p>
              {m.display_name && <p className="text-xs text-muted">{m.display_name}</p>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
