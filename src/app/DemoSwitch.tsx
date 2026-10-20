// For shared demo accounts: hop to another side of the product without signing out.
const SIDES = [
  ["team", "Team · Seattle Sounders FC"],
  ["sponsor", "Sponsor · Gatorade"],
  ["fan", "Fan"],
] as const;

export default function DemoSwitch({ current }: { current: "team" | "sponsor" | "fan" }) {
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-full bg-warn/15 px-3 py-1 font-semibold text-warn">Demo · switch side ▾</summary>
      <div className="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-line bg-panel p-2 shadow-lg">
        {SIDES.filter(([k]) => k !== current).map(([kind, label]) => (
          <form key={kind} action="/auth/demo" method="post">
            <input type="hidden" name="as" value={kind} />
            <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-text hover:bg-panel-2">Try as {label}</button>
          </form>
        ))}
      </div>
    </details>
  );
}
