"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const path = usePathname();
  if (!tabs.length) return null;
  return (
    <ul className="flex flex-wrap gap-1 text-sm">
      {tabs.map((t) => {
        const on = path === t.href || (t.href !== "/fanfit" && path.startsWith(t.href + "/"));
        return (
          <li key={t.href}>
            <Link
              href={t.href}
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
