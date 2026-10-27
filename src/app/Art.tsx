import Image from "next/image";

// Drawn artwork (no image files, nothing to license): pitch lines for header bands, the home page's fit diagram,
// and monogram avatars for teams and brands (real logos are trademarks, so FanFit never shows them).

/** Football-pitch lines, for coloured header bands. Inherits colour from the parent (currentColor). */
export function PitchLines({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 300" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden preserveAspectRatio="xMidYMid slice">
      <rect x="10" y="10" width="580" height="280" rx="4" />
      <line x1="300" y1="10" x2="300" y2="290" />
      <circle cx="300" cy="150" r="48" />
      <circle cx="300" cy="150" r="3" fill="currentColor" />
      <rect x="10" y="80" width="80" height="140" />
      <rect x="10" y="115" width="30" height="70" />
      <rect x="510" y="80" width="80" height="140" />
      <rect x="560" y="115" width="30" height="70" />
      <path d="M90 118 A40 40 0 0 1 90 182" />
      <path d="M510 118 A40 40 0 0 0 510 182" />
    </svg>
  );
}

/**
 * The idea of FanFit in one picture: a team's fans and a brand's fans, and who and what sits in the overlap.
 * Every value is from a real report made in the demo (Seattle Sounders FC × Gatorade, Qloo data, 2026-10-20).
 */
export function FitDiagram() {
  const chips = [
    { label: "Nike Training Club", kind: "brand", pos: "left-[4%] top-[8%]" },
    { label: "Kygo", kind: "artist", pos: "right-[6%] top-[4%]" },
    { label: "Space Needle", kind: "place", pos: "left-[0%] bottom-[27%] sm:bottom-[14%]" },
    { label: "Major Lazer", kind: "artist", pos: "right-[2%] bottom-[31%] sm:bottom-[20%]" },
  ];
  return (
    <figure className="relative mx-auto aspect-[5/4] w-full max-w-md">
      <div className="absolute left-[8%] top-[18%] h-[62%] w-[54%] rounded-full bg-team/85 mix-blend-multiply" />
      <div className="absolute right-[8%] top-[18%] h-[62%] w-[54%] rounded-full bg-brand/80 mix-blend-multiply" />
      <p className="absolute left-[13%] top-[44%] max-w-[22%] text-xs font-semibold leading-tight text-white">Seattle Sounders FC fans</p>
      <p className="absolute right-[13%] top-[44%] max-w-[20%] text-right text-xs font-semibold leading-tight text-white">Gatorade fans</p>
      <div className="absolute left-1/2 top-[38%] -translate-x-1/2 rounded-2xl bg-white px-3 py-2 text-center shadow-xl">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Shared fans</p>
        <p className="text-lg font-bold text-ink">25–29</p>
      </div>
      {chips.map((c) => (
        <span key={c.label} className={`absolute ${c.pos} rounded-full border border-white/70 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-ink shadow-md`}>
          <span className="mr-1 text-muted">{c.kind === "brand" ? "◆" : c.kind === "artist" ? "♪" : "⌖"}</span>
          {c.label}
        </span>
      ))}
      <div className="absolute bottom-[2%] left-1/2 w-[70%] -translate-x-1/2 rounded-2xl bg-white p-3 shadow-xl">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold text-gain">Strong fit</span>
          <span className="font-mono text-xs text-muted">+2.4σ · #22 of 79</span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-panel-2">
          <div className="h-1.5 w-[78%] rounded-full bg-gain" />
        </div>
      </div>
      <figcaption className="sr-only">
        Example from the demo: Seattle Sounders FC fans and Gatorade fans overlap most at ages 25–29; people who like both also love Nike
        Training Club, Kygo, Major Lazer and the Space Needle. Strong fit, 2.4 standard deviations above a typical brand.
      </figcaption>
    </figure>
  );
}

const HUES = ["bg-team", "bg-brand", "bg-fan", "bg-gain", "bg-sun", "bg-ink"];

/** Initials in a coloured circle; the colour is stable per name. */
export function Monogram({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const dim = size === "sm" ? "h-7 w-7 text-[10px]" : size === "lg" ? "h-12 w-12 text-sm" : "h-9 w-9 text-xs";
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ${HUES[h % HUES.length]} ${dim}`}>
      {initials}
    </span>
  );
}

/**
 * A photo filling its (relative) parent, tinted so text on top stays readable. Photos are free-licence stock (see
 * README, Image credits), cropped so no club crest or brand logo is legible.
 */
export function Photo({ src, tint, opacity = 0.35, priority = false }: { src: string; tint: string; opacity?: number; priority?: boolean }) {
  return (
    <>
      <Image src={src} alt="" fill sizes="100vw" priority={priority} className="pointer-events-none object-cover" style={{ opacity }} />
      <div className={`pointer-events-none absolute inset-0 ${tint}`} />
    </>
  );
}
