// Page header for the team and brand workspaces: a photo band tinted in the side's colour (team blue, brand violet)
// with the page's icon, then the description on the page background so it stays easy to read.
import { ChartColumn, Handshake, Radar, Send, Sparkles, Ticket, Users } from "lucide-react";
import { Photo } from "./Art";

const ICONS = { radar: Radar, sparkles: Sparkles, chart: ChartColumn, ticket: Ticket, send: Send, handshake: Handshake, users: Users };

export default function PageHeader({
  side,
  icon,
  eyebrow,
  title,
  tour,
  photo,
  children,
}: {
  photo?: string; // defaults: the aerial pitch for teams, the arena for brands
  side: "team" | "sponsor";
  icon: keyof typeof ICONS;
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  tour?: string;
  children?: React.ReactNode;
}) {
  const Icon = ICONS[icon];
  return (
    <header data-tour={tour} className="mt-6">
      <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br p-6 text-white sm:p-8 ${side === "team" ? "from-team to-ink" : "from-brand to-ink"}`}>
        <Photo
          src={photo ?? (side === "team" ? "/images/pitch.jpg" : "/images/arena.jpg")}
          tint={side === "team" ? "bg-gradient-to-br from-team/75 via-team/55 to-ink/80" : "bg-gradient-to-br from-brand/80 via-brand/55 to-ink/80"}
          opacity={1}
        />
        <div className="relative flex items-start gap-4">
          <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 sm:flex">
            <Icon className="h-6 w-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/70">{eyebrow}</p>
            <h1 className="mt-1 text-3xl font-bold sm:text-4xl">{title}</h1>
          </div>
        </div>
      </div>
      {children && <div className="mt-4">{children}</div>}
    </header>
  );
}
