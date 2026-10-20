// The right end of the top bar: the organisation's name, opening a menu with who is signed in, demo side switching
// (shared demo accounts) and sign out. One compact control, so the bar stays on one line.
import { SIDES } from "./DemoSwitch";

export default function AccountMenu({ name, org, role, demo }: { name: string; org: string; role: "team" | "sponsor"; demo: boolean }) {
  return (
    <details className="group relative shrink-0">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs hover:border-accent">
        {demo && <span className="rounded-full bg-warn/15 px-1.5 py-0.5 text-[10px] font-bold text-warn">DEMO</span>}
        <span className="max-w-[9rem] truncate font-semibold sm:max-w-[14rem]">{org}</span>
        <span className="text-muted transition group-open:rotate-180">▾</span>
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-line bg-panel p-2 text-sm shadow-lg">
        <p className="px-3 py-2 text-xs text-muted">
          Signed in as <span className="font-semibold text-text">{name}</span>
          <br />
          {org} · {role === "team" ? "team account" : "brand account"}
        </p>
        {demo && (
          <div className="border-t border-line pt-1">
            <p className="px-3 pt-1 text-[11px] font-semibold uppercase tracking-wide text-warn">Demo · try another side</p>
            {SIDES.filter(([k]) => k !== role).map(([kind, label]) => (
              <form key={kind} action="/auth/demo" method="post">
                <input type="hidden" name="as" value={kind} />
                <button className="w-full rounded-lg px-3 py-2 text-left hover:bg-panel-2">{label}</button>
              </form>
            ))}
          </div>
        )}
        <a href="/fans" className="block border-t border-line px-3 py-2 hover:bg-panel-2">
          Fan side: deals and your teams →
        </a>
        <form action="/auth/signout" method="post" className="border-t border-line pt-1">
          <button className="w-full rounded-lg px-3 py-2 text-left text-muted hover:bg-panel-2 hover:text-text">Sign out</button>
        </form>
      </div>
    </details>
  );
}
