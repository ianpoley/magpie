import { engineConfig, engineMcp } from "@/lib/engine";

type McpHandler = ReturnType<Awaited<ReturnType<typeof engineMcp>>["magpieMcpHandler"]>;

const FROM_A_WEB_PAGE =
  "Forbidden: the MCP endpoint refuses requests from web pages (any request with an Origin header). Connect from an MCP client such as Claude Code.\n";

let handler: Promise<McpHandler> | undefined;

async function createHandler(): Promise<McpHandler> {
  const [{ magpieMcpHandler }, { paths }] = await Promise.all([engineMcp(), engineConfig()]);
  return magpieMcpHandler(() => {
    const { store, dataDir } = paths();
    return { store, dir: dataDir };
  });
}

async function serve(request: Request): Promise<Response> {
  if (request.headers.get("origin") !== null) return new Response(FROM_A_WEB_PAGE, { status: 403 });
  handler ??= createHandler().catch((error: unknown) => {
    handler = undefined;
    throw error;
  });
  return (await handler).fetch(request);
}

export const GET = serve;
export const POST = serve;
