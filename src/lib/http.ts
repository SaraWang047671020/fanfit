import { DOMAINS, type Domain, QlooError } from "@/lib/qloo";

export function isDomain(d: unknown): d is Domain {
  return typeof d === "string" && (DOMAINS as readonly string[]).includes(d);
}

export function errorResponse(err: unknown) {
  const status = err instanceof QlooError ? err.status : 500;
  const message = err instanceof Error ? err.message : "Unknown error";
  console.error(message);
  return Response.json({ error: message }, { status: status >= 400 && status < 600 ? status : 500 });
}
