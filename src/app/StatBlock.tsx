// A solid colour tile for a headline number: the big colour blocks of the workspace pages.
import type { LucideIcon } from "lucide-react";

const TONES = {
  team: "from-team to-[#2c47b3] text-white",
  brand: "from-brand to-[#5533c4] text-white",
  gain: "from-gain to-[#086b53] text-white",
  sun: "from-sun to-[#e08a00] text-ink",
  fan: "from-fan to-[#b53a0a] text-white",
  ink: "from-ink to-[#22306a] text-white",
} as const;

export default function StatBlock({
  icon: Icon,
  label,
  value,
  sub,
  tone = "team",
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: keyof typeof TONES;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br p-4 shadow-md sm:p-5 ${TONES[tone]}`}>
      <Icon aria-hidden className="absolute -bottom-4 -right-4 h-24 w-24 opacity-15" strokeWidth={1.75} />
      <p className="relative text-xs font-semibold uppercase tracking-wider opacity-80">{label}</p>
      <p
        className={`relative mt-1 font-bold tracking-tight ${typeof value === "string" && value.length > 12 ? "line-clamp-2 text-xl leading-tight sm:text-2xl" : "truncate text-3xl"}`}
      >
        {value}
      </p>
      {sub && <p className="relative mt-1 text-xs opacity-80">{sub}</p>}
    </div>
  );
}
