// Fit band labels, kept apart from sponsor-fit.ts (server-only) so the client team list can import them.
/** Plain-language band for a z-score, shown next to the number. */
export function fitBand(z: number | null) {
  if (z === null) return "No data";
  if (z >= 1.5) return "Strong";
  if (z >= 0.75) return "Good";
  if (z >= 0) return "Average";
  return "Weak";
}
