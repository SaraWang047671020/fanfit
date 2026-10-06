import { tasteBridge, type CreativePackage } from "@/lib/tasteframe";
import { errorResponse, isDomain } from "@/lib/http";

export const maxDuration = 60;

// POST /api/bridge { package: CreativePackage, seeds: string[], domain: Domain }
export async function POST(req: Request) {
  const body = (await req.json()) as { package?: CreativePackage; seeds?: string[]; domain?: unknown };
  if (!body.package?.entities?.length || !body.seeds?.length || !isDomain(body.domain))
    return Response.json({ error: "package, seeds and a valid domain are required" }, { status: 400 });
  try {
    return Response.json(await tasteBridge(body.package, body.seeds, body.domain));
  } catch (err) {
    return errorResponse(err);
  }
}
