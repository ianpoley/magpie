import { isSameOriginJson } from "@/lib/ask";
import { readSyncState } from "@/lib/sync-state";

/**
 * The sync panel polls this while a run is in progress or requested. It
 * answers only the app's own page, and never holds a cookie value.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isSameOriginJson(request.headers)) return Response.json({ message: "This request did not come from the app." }, { status: 403 });
  return Response.json(await readSyncState(), { headers: { "Cache-Control": "no-store" } });
}
