import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";

export default async function Home() {
  // Signed-in users go straight to their side of the product (Supabase not configured: just show the page).
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const { user, profile } = await currentUser();
    if (user) redirect(profile?.role === "team" ? "/fanfit" : profile?.role === "sponsor" ? "/sponsor" : "/onboarding");
  }
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-gain">FanFit</p>
      <h1 className="mt-3 max-w-3xl text-4xl font-bold sm:text-5xl">Sponsorships your fans already love.</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted">
        FanFit reads what a team&apos;s fans actually like — brands, music, places — from Qloo&apos;s taste data, and matches teams and
        sponsors on it. Every recommendation shows why, and every news signal links to its source.
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Side
          title="For teams"
          points={[
            "Brands and local businesses your fans love, by age group",
            "Best fit in each sponsorship category, with current sponsors flagged",
            "A reason to call each one now, and a matchday activation idea",
          ]}
        />
        <Side
          title="For sponsors"
          points={[
            "Every NBA, MLS, WNBA and NWSL team ranked by how much its fans like your brand",
            "Why the fit is there: shared audiences, tastes and traits",
            "Whether your category is taken, and why now is a good time",
          ]}
        />
      </div>
      <Link href="/login" className="mt-10 inline-block rounded-full bg-accent px-8 py-3 text-sm font-semibold text-bg">
        Sign in or create an account
      </Link>
    </main>
  );
}

function Side({ title, points }: { title: string; points: string[] }) {
  return (
    <section className="rounded-3xl border border-line bg-panel/90 p-6">
      <p className="font-semibold">{title}</p>
      <ul className="mt-3 space-y-2 text-sm text-muted">
        {points.map((p) => (
          <li key={p} className="flex gap-2">
            <span className="text-gain">→</span>
            {p}
          </li>
        ))}
      </ul>
    </section>
  );
}
