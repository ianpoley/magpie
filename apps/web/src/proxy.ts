import { NextResponse, type NextRequest } from "next/server";

import { isLoopbackHost } from "@/lib/ask";

export function proxy(request: NextRequest) {
  if (!isLoopbackHost(request.headers.get("host"))) return new Response("Forbidden", { status: 403 });
  return NextResponse.next();
}
