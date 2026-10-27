import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@/lib/supabase/server";
import { FollowButton, JoinFan } from "../FanButtons";
import SectionIcon from "@/app/SectionIcon";
import { Star } from "lucide-react";

export const metadata: Metadata = { title: "Account · FanFit" };

export default async function FanAccountPage() {
  const { supabase, user, profile } = await currentUser();

  if (!user)
    return (
      <Shell>
        <p className="text-muted">Sign in to keep your coupons when you switch phones and to follow your teams. You can claim codes without an account.</p>
        <Link href="/login?next=/fans/account" className="mt-6 inline-block rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-bg">
          Sign in or create an account
        </Link>
      </Shell>
    );

  if (!profile?.role)
    return (
      <Shell>
        <p className="text-muted">Signed in as {user.email}. Continue as a fan to save coupons and follow teams.</p>
        <div className="mt-6">
          <JoinFan />
        </div>
        <p className="mt-6 text-xs text-muted">
          Work for a team or a brand? <Link href="/onboarding" className="text-accent">Set up a team or sponsor account instead</Link>.
        </p>
        <SignOut />
      </Shell>
    );

  const { data: follows } = await supabase
    .from("fan_follows")
    .select("team_id, teams(name, league, city)")
    .returns<{ team_id: string; teams: { name: string; league: string; city: string } | null }[]>();
  return (
    <Shell>
      <p className="text-muted">Signed in as {user.email}.</p>
      {(profile.role === "team" || profile.role === "sponsor") && (
        <p className="mt-2 text-sm text-muted">
          Your {profile.role === "team" ? "club" : "brand"} account works here as a fan too.{" "}
          <Link href={profile.role === "team" ? "/fanfit" : "/sponsor"} className="text-accent">
            Go to your {profile.role === "team" ? "team" : "brand"} workspace →
          </Link>
        </p>
      )}
      <section className="mt-6">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-accent"><SectionIcon icon={Star} tone="fan" /> Teams you follow</h2>
        {(follows ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            None yet. Open a team from <Link href="/fans" className="text-accent">Home</Link> and tap Follow.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {follows!.map((f) => (
              <li key={f.team_id} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-panel px-4 py-3">
                <Link href={`/t/${f.team_id}`} className="min-w-0">
                  <span className="block truncate font-semibold">{f.teams?.name}</span>
                  <span className="block text-xs text-muted">
                    {f.teams?.league} · {f.teams?.city}
                  </span>
                </Link>
                <FollowButton teamId={f.team_id} following />
              </li>
            ))}
          </ul>
        )}
      </section>
      <SignOut />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
      <h1 className="text-3xl font-bold">Account</h1>
      <div className="mt-3">{children}</div>
    </main>
  );
}

function SignOut() {
  return (
    <form action="/auth/signout" method="post" className="mt-8">
      <button className="rounded-full border border-line px-4 py-2 text-sm text-muted hover:border-accent hover:text-text">Sign out</button>
    </form>
  );
}
