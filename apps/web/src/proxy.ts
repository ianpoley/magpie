import { NextResponse, type NextRequest } from "next/server";

import { isLoopbackHost } from "@/lib/ask";

const FOREIGN_HOST =
  "Forbidden: Magpie answers only requests addressed to localhost. A reverse proxy in front of it must send a loopback Host header, such as Caddy's header_up Host localhost.\n";

export function proxy(request: NextRequest) {
  if (!isLoopbackHost(request.headers.get("host"))) return new Response(FOREIGN_HOST, { status: 403 });
  return NextResponse.next();
}
