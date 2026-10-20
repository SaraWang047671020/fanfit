"use client";

import { useState } from "react";

// Tabs over server-rendered panels: every panel renders (so Suspense streams them all), only the chosen one shows.
export default function Tabs({ tabs, tour }: { tabs: { key: string; label: string; content: React.ReactNode }[]; tour?: string }) {
  const [on, setOn] = useState(tabs[0]?.key);
  return (
    <div>
      <div role="tablist" data-tour={tour} className="flex flex-wrap gap-2 border-b border-line pb-3">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={on === t.key}
            onClick={() => setOn(t.key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${on === t.key ? "bg-accent text-white" : "border border-line bg-panel text-muted hover:text-text"}`}
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
