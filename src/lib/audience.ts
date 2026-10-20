// A sponsor's target audience: age group, gender and one interest, sent to Qloo as extra signals when scoring teams
// ("how much do fans in this audience like your brand"). Client-safe: the target picker imports it too.
//
// Tested on the hackathon API (2026-10-20): age, gender and interest tags each change the team ranking; Qloo's
// audience groups (urn:audience:…) were accepted but did not change any result, so they are not offered.
import { AGES, AGE_LABEL, type Age } from "./fanfit-score";

export type Gender = "female" | "male";
export interface Target {
  age?: Age;
  gender?: Gender;
  interest?: InterestKey;
}

// Presets checked to move the ranking (craft beer did not, so it is not here).
export const INTERESTS = {
  fitness: { label: "Fitness", tag: "urn:tag:genre:media:fitness" },
  outdoors: { label: "Outdoors", tag: "urn:tag:genre:media:outdoors" },
  gaming: { label: "Video games", tag: "urn:tag:genre:media:video_games" },
  fashion: { label: "Fashion", tag: "urn:tag:genre:media:fashion" },
  travel: { label: "Travel", tag: "urn:tag:genre:media:travel" },
  cooking: { label: "Cooking", tag: "urn:tag:genre:media:cooking" },
  hiphop: { label: "Hip hop", tag: "urn:tag:genre:media:hip_hop" },
  country: { label: "Country music", tag: "urn:tag:keyword:qloo:country_music" },
  family: { label: "Family", tag: "urn:tag:genre:media:family" },
} as const;
export type InterestKey = keyof typeof INTERESTS;

export const GENDER_LABEL: Record<Gender, string> = { female: "Women", male: "Men" };

/** Read a target from URL search params (?age=&gender=&interest=); null when none is set or values are unknown. */
export function parseTarget(p: Record<string, string | string[] | undefined>): Target | null {
  const one = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : undefined);
  const age = AGES.find((a) => a === one("age"));
  const g = one("gender");
  const gender = g === "female" || g === "male" ? g : undefined;
  const i = one("interest");
  const interest = i && i in INTERESTS ? (i as InterestKey) : undefined;
  return age || gender || interest ? { age, gender, interest } : null;
}

/** Qloo signal params for a target. */
export function targetSignals(t: Target | null | undefined): Record<string, string> {
  if (!t) return {};
  return {
    ...(t.age ? { "signal.demographics.age": t.age } : {}),
    ...(t.gender ? { "signal.demographics.gender": t.gender } : {}),
    ...(t.interest ? { "signal.interests.tags": INTERESTS[t.interest].tag } : {}),
  };
}

/** "Women 25–29 into Fitness" */
export function describeTarget(t: Target) {
  const who = [t.gender ? GENDER_LABEL[t.gender] : "Fans", t.age ? AGE_LABEL[t.age] : ""].filter(Boolean).join(" ");
  return t.interest ? `${who} into ${INTERESTS[t.interest].label}` : who;
}
