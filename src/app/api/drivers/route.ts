import { packageDrivers, type CreativePackage } from "@/lib/tasteframe";
import { errorResponse, isDomain } from "@/lib/http";

export const maxDuration = 60;

// POST /api/drivers { package: CreativePackage, domain: Domain }
export async function POST(req: Request) {
  const body = (await req.json()) as { package?: CreativePackage; domain?: unknown };
  if (!body.package?.entities?.length || !isDomain(body.domain))
    return Response.json({ error: "package and a valid domain are required" }, { status: 400 });
  try {
    return Response.json({ drivers: await packageDrivers(body.package, body.domain) });
  } catch (err) {
    return errorResponse(err);
  }
}
