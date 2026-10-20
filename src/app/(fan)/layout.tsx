// Fan pages (fan home, deals near me, my coupons, account, each team's fan map) share a phone-style shell:
// a slim top bar and a bottom tab bar. Installed to the home screen (manifest.ts), it opens like an app.
import type { Viewport } from "next";
import Link from "next/link";
import FanNav from "./FanNav";

export const viewport: Viewport = { themeColor: "#0b0d12", viewportFit: "cover" };

export default function FanLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-[1000] border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-12 w-full max-w-5xl items-center justify-between px-4">
          <Link href="/fans" className="text-sm font-bold">
            <span className="text-gain">Fan</span>Fit
          </Link>
          <span className="text-xs text-muted">Deals from your team&apos;s partners</span>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <FanNav />
    </div>
  );
}
