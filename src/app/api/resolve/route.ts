import type { NextRequest } from "next/server";
import { resolveEntity } from "@/lib/tasteframe";
import type { EntityType } from "@/lib/qloo";
import { errorResponse } from "@/lib/http";

const TYPES: EntityType[] = ["movie", "artist", "brand", "person"];

// GET /api/resolve?q=Hereditary&type=movie
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const type = req.nextUrl.searchParams.get("type") as EntityType;
  if (!q || !TYPES.includes(type)) return Response.json({ error: "q and a valid type are required" }, { status: 400 });
  try {
    return Response.json({ entity: await resolveEntity(q, type) });
  } catch (err) {
    return errorResponse(err);
  }
}
