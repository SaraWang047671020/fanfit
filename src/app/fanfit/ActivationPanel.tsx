// Activation idea card, shared by the team console and the sponsor's team page.
import type { Activation } from "@/lib/fanfit-activation";

const fit = (x: number | null) => (x === null ? "n/a" : x.toFixed(2));

export default function ActivationPanel({ a, partner }: { a: Activation; partner: string }) {
  return (
    <div className="mt-3 rounded-xl border border-gain/40 bg-bg/60 p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-gain">Activation idea · for fans {a.segment}</p>
      <h4 className="mt-1 text-base font-semibold">{a.title}</h4>
      <p className="mt-1 text-muted">{a.concept}</p>
      <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
        {a.performer && (
          <Ingredient label="Halftime / pre-game act" s={a.performer} partner={partner} />
        )}
        {a.coPartner && (
          <Ingredient label={a.coPartner.kind === "place" ? "Local co-partner" : "Brand co-partner"} s={a.coPartner} partner={partner} />
        )}
        <div>
          <dt className="text-muted">Co-branded item</dt>
          <dd className="mt-0.5">{a.merch}</dd>
        </div>
        {a.hook && (
          <div>
            <dt className="text-muted">Why now</dt>
            <dd className="mt-0.5">{a.hook}</dd>
          </div>
        )}
      </dl>
      {(a.theme.team.length > 0 || a.theme.partner.length > 0) && (
        <p className="mt-3 text-xs text-muted">
          Theme built on Qloo tags — team: <span className="text-text">{a.theme.team.join(", ") || "—"}</span> · {partner}:{" "}
          <span className="text-text">{a.theme.partner.join(", ") || "—"}</span>
        </p>
      )}
      {(a.alternatives.performers.length > 0 || a.alternatives.coPartners.length > 0) && (
        <p className="mt-1 text-xs text-muted">
          Other Qloo picks: {[...a.alternatives.performers, ...a.alternatives.coPartners].join(", ")}
        </p>
      )}
      <p className="mt-2 text-[11px] text-muted">
        Picks are ranked by Qloo for people who like both the team and {partner}. Availability and cost need checking.
      </p>
    </div>
  );
}

function Ingredient({ label, s, partner }: { label: string; s: { name: string; detail: string; fitTeam: number | null; fitPartner: number | null }; partner: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 font-semibold">{s.name}</dd>
      {s.detail && <dd className="text-muted">{s.detail}</dd>}
      <dd className="mt-0.5 font-mono text-gain">
        fits team fans {fit(s.fitTeam)} · fits {partner} {fit(s.fitPartner)}
      </dd>
    </div>
  );
}
