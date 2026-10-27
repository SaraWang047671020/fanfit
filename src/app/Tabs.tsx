"use client";

import { useState } from "react";

// Tabs over server-rendered panels: every panel renders (so Suspense streams them all), only the chosen one shows.
export default function Tabs({ tabs, tour }: { tabs: { key: string; label: string; content: React.ReactNode }[]; tour?: string }) {
  const [on, setOn] = useState(tabs[0]?.key);
  return (
    <div>
      <div role="tablist" data-tour={tour} className="flex w-fit max-w-full flex-wrap gap-1 rounded-2xl border border-line bg-panel p-1.5 shadow-[0_1px_2px_rgba(20,26,43,0.04)]">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={on === t.key}
            onClick={() => setOn(t.key)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${on === t.key ? "bg-accent text-white shadow-sm" : "text-muted hover:bg-panel-2 hover:text-text"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} role="tabpanel" hidden={on !== t.key} className="mt-6">
          {t.content}
        </div>
      ))}
    </div>
  );
}
