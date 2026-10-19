/** Where to go after sign-in. Only same-site paths, so a crafted link cannot bounce people to another site. */
export function safeNext(next: string | null | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/onboarding";
}
