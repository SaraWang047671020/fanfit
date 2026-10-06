import { compareDomain, type CreativePackage } from "@/lib/tasteframe";
import { DOMAINS } from "@/lib/qloo";
import { errorResponse, isDomain } from "@/lib/http";

export const maxDuration = 60;

// POST /api/compare { a: CreativePackage, b: CreativePackage, domains?: Domain[] }
export async function POST(req: Request) {
  const { a, b, domains } = (await req.json()) as { a?: CreativePackage; b?: CreativePackage; domains?: unknown[] };
  if (!a?.entities?.length || !b?.entities?.length) return Response.json({ error: "a and b packages are required" }, { status: 400 });
  const ds = domains?.length ? domains.filter(isDomain) : [...DOMAINS];
  try {
    return Response.json({ comparisons: await Promise.all(ds.map((d) => compareDomain(a, b, d))) });
  } catch (err) {
    return errorResponse(err);
  }
}
