// Fan pages (fan home, deals near me, my coupons, account, each team's fan map) share a phone-style shell:
// a slim top bar and a bottom tab bar. Installed to the home screen (manifest.ts), it opens like an app.
import type { Viewport } from "next";
import Link from "next/link";
import { currentUser } from "@/lib/supabase/server";
import DemoSwitch from "../DemoSwitch";
import FanNav from "./FanNav";

// Fixed scale comes from the root layout; Next merges these fields over it.
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, themeColor: "#f5f7fb", viewportFit: "cover" };

export default async function FanLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = process.env.NEXT_PUBLIC_SUPABASE_URL ? await currentUser() : { user: null, profile: null };
  return (
    <div className="flex min-h-full flex-1 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-[1000] border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-12 w-full max-w-5xl items-center justify-between px-4">
          <Link href="/fans" className="text-sm font-bold">
            <span className="text-gain">Fan</span>Fit
          </Link>
          {profile?.is_demo ? (
            <div className="text-xs">
              <DemoSwitch current="fan" />
            </div>
          ) : !user ? (
            <form action="/auth/demo" method="post">
              <input type="hidden" name="as" value="fan" />
              <button className="rounded-full bg-gain px-3 py-1 text-xs font-semibold text-white">Try the fan demo</button>
            </form>
          ) : (
            <span className="text-xs text-muted">Deals from your team&apos;s partners</span>
          )}
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <FanNav />
    </div>
  );
}
