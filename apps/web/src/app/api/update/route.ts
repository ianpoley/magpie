import { isSameOriginJson } from "@/lib/ask";
import { pullUpdate } from "@/lib/update-status";

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginJson(request.headers)) return Response.json({ message: "This request did not come from the app." }, { status: 403 });
  const outcome = await pullUpdate();
  return Response.json(outcome, { status: outcome.ok ? 200 : 409, headers: { "Cache-Control": "no-store" } });
}
