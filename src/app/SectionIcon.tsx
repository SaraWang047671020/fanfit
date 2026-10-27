// A small coloured icon tile in front of a section heading, so workspace pages scan by colour as well as by label.
import type { LucideIcon } from "lucide-react";

const TONES = {
  team: "bg-team/10 text-team",
  brand: "bg-brand/10 text-brand",
  gain: "bg-gain/10 text-gain",
  sun: "bg-sun/15 text-warn",
  fan: "bg-fan/10 text-fan",
  white: "bg-white/15 text-white", // on a colour band
} as const;

export default function SectionIcon({ icon: Icon, tone = "team" }: { icon: LucideIcon; tone?: keyof typeof TONES }) {
  return (
    <span aria-hidden className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${TONES[tone]}`}>
      <Icon className="h-4 w-4" strokeWidth={2.25} />
    </span>
  );
}
