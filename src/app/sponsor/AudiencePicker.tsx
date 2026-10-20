"use client";

// Target audience for the team ranking: age group, gender and an interest. Kept in the URL (?age=&gender=&interest=)
// so the server re-scores with Qloo and the view can be shared.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { GENDER_LABEL, INTERESTS, type Gender, type InterestKey, type Target, describeTarget } from "@/lib/audience";
import { AGES, AGE_LABEL, type Age } from "@/lib/fanfit-score";

export default function AudiencePicker({ target }: { target: Target | null }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const set = (key: "age" | "gender" | "interest", value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    start(() => router.push(`${path}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };
  const clear = () => start(() => router.push(path, { scroll: false }));

  const pill = (on: boolean) =>
    `rounded-full border px-3 py-1 text-xs ${on ? "border-accent bg-accent text-white" : "border-line text-muted hover:border-accent hover:text-text"}`;

  return (
    <section data-tour="audience" className="rounded-3xl border border-line bg-panel/90 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Target audience</p>
        <p className="text-xs text-muted">
          {pending ? "Re-scoring every team with Qloo…" : target ? `Ranking for ${describeTarget(target)}` : "Ranking for all fans"}
          {target && !pending && (
            <button onClick={clear} className="ml-2 font-semibold text-accent">
              Clear
            </button>
          )}
        </p>
      </div>
      <div className={`mt-3 space-y-2.5 ${pending ? "opacity-60" : ""}`}>
        <Row label="Age">
          <button onClick={() => set("age", null)} className={pill(!target?.age)}>
            Any
          </button>
          {AGES.map((a: Age) => (
            <button key={a} onClick={() => set("age", a)} className={pill(target?.age === a)}>
              {AGE_LABEL[a]}
            </button>
          ))}
        </Row>
        <Row label="Gender">
          <button onClick={() => set("gender", null)} className={pill(!target?.gender)}>
            Any
          </button>
          {(Object.keys(GENDER_LABEL) as Gender[]).map((g) => (
            <button key={g} onClick={() => set("gender", g)} className={pill(target?.gender === g)}>
              {GENDER_LABEL[g]}
            </button>
          ))}
        </Row>
        <Row label="Into">
          <button onClick={() => set("interest", null)} className={pill(!target?.interest)}>
            Anything
          </button>
          {(Object.keys(INTERESTS) as InterestKey[]).map((k) => (
            <button key={k} onClick={() => set("interest", k)} className={pill(target?.interest === k)}>
              {INTERESTS[k].label}
            </button>
          ))}
        </Row>
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-14 shrink-0 text-xs text-muted">{label}</span>
      {children}
    </div>
  );
}
