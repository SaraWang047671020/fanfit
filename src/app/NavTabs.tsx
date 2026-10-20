"use client";

import Link from "next/link";
import { ChartColumn, Handshake, Radar, Send, Sparkles, Ticket, Users } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const ICON: Record<string, typeof Radar> = {
  "/fanfit": Radar,
  "/ask": Sparkles,
  "/team/sponsors": Handshake,
  "/team/offers": Ticket,
  "/team/outreach": Send,
  "/team/members": Users,
  "/sponsor": ChartColumn,
  "/sponsor/outreach": Send,
};

export default function NavTabs({ tabs }: { tabs: { href: string; label: string; badge?: number }[] }) {
  const path = usePathname();
  const row = useRef<HTMLUListElement>(null);
  const [more, setMore] = useState(false); // tabs hidden past the right edge: show a fade

  // On narrow screens the row scrolls sideways: bring the current tab into view, and fade the edge while more remain.
  useEffect(() => {
    const ul = row.current;
    if (!ul) return;
    const on = ul.querySelector<HTMLElement>('[aria-current="page"]');
    if (on) ul.scrollLeft = on.offsetLeft - (ul.clientWidth - on.offsetWidth) / 2;
    const check = () => setMore(ul.scrollLeft + ul.clientWidth < ul.scrollWidth - 4);
    check();
    ul.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      ul.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [path]);

  if (!tabs.length) return null;
  // The most specific tab wins (/sponsor/outreach, not /sponsor; /sponsor/teams/… still lights up Team ranking).
  const active = tabs
    .filter((t) => path === t.href || (t.href !== "/fanfit" && path.startsWith(t.href + "/")))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <div className="relative">
      <ul ref={row} className="no-scrollbar flex gap-1 overflow-x-auto text-sm">
        {tabs.map((t) => {
          const on = t.href === active;
          return (
            <li key={t.href} className="shrink-0">
              <Link
                href={t.href}
                data-tour={`nav-${t.href}`}
                aria-current={on ? "page" : undefined}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 font-medium ${on ? "bg-accent text-white" : "text-muted hover:bg-panel-2 hover:text-text"}`}
              >
                {(() => {
                  const I = ICON[t.href];
                  return I ? <I className="h-4 w-4" aria-hidden /> : null;
                })()}
                {t.label}
                {!!t.badge && (
                  <span
                    aria-label={`${t.badge} new`}
                    className={`min-w-[1.25rem] rounded-full px-1.5 text-center text-[11px] font-bold leading-5 ${on ? "bg-white/25 text-white" : "bg-accent text-white"}`}
                  >
                    {t.badge}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      {more && (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-panel to-transparent" />
      )}
    </div>
  );
}
