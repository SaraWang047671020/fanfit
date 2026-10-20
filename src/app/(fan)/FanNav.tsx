"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ICON = {
  home: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z",
  near: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  codes: "M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zm7 0v10",
  account: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0",
};

const TABS = [
  { href: "/fans", label: "Home", icon: ICON.home, match: (p: string) => p === "/fans" || p.startsWith("/t/") },
  { href: "/fans/near", label: "Near me", icon: ICON.near, match: (p: string) => p.startsWith("/fans/near") },
  { href: "/fans/codes", label: "My coupons", icon: ICON.codes, match: (p: string) => p.startsWith("/fans/codes") },
  { href: "/fans/account", label: "Account", icon: ICON.account, match: (p: string) => p.startsWith("/fans/account") },
];

export default function FanNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Fan sections"
      className="fixed inset-x-0 bottom-0 z-[1000] border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto grid h-16 w-full max-w-md grid-cols-4">
        {TABS.map((t) => {
          const on = t.match(path);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-1 text-[11px] ${on ? "text-gain" : "text-muted hover:text-text"}`}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden>
                  <path d={t.icon} />
                </svg>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
