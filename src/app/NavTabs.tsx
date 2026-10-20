"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const path = usePathname();
  if (!tabs.length) return null;
  // The most specific tab wins (/sponsor/outreach, not /sponsor; /sponsor/teams/… still lights up Team ranking).
  const active = tabs
    .filter((t) => path === t.href || (t.href !== "/fanfit" && path.startsWith(t.href + "/")))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <ul className="flex flex-wrap gap-1 text-sm">
      {tabs.map((t) => {
        const on = t.href === active;
        return (
          <li key={t.href}>
            <Link
              href={t.href}
              data-tour={`nav-${t.href}`}
              aria-current={on ? "page" : undefined}
              className={`block rounded-full px-3 py-1.5 font-medium ${on ? "bg-accent text-white" : "text-muted hover:bg-panel-2 hover:text-text"}`}
            >
              {t.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
