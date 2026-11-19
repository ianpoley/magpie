import { NextResponse, type NextRequest } from "next/server";

import { isLoopbackHost } from "@/lib/ask";

/**
 * Answers only when addressed as this machine. A site that points its own
 * name at 127.0.0.1 would otherwise share this app's origin, read the corpus
 * and call its edits. There is no matcher on purpose: this covers every page,
 * asset, route and server action.
 */
export function proxy(request: NextRequest) {
  if (!isLoopbackHost(request.headers.get("host"))) return new Response("Forbidden", { status: 403 });
  return NextResponse.next();
}
