import { isSameOriginJson } from "@/lib/ask";
import { readUpdateState } from "@/lib/update-status";

export async function GET(request: Request): Promise<Response> {
  if (!isSameOriginJson(request.headers)) return Response.json({ message: "This request did not come from the app." }, { status: 403 });
  return Response.json(await readUpdateState(), { headers: { "Cache-Control": "no-store" } });
}
