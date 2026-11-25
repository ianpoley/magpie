import { engineConfig, engineMcp } from "@/lib/engine";

type McpHandler = ReturnType<Awaited<ReturnType<typeof engineMcp>>["magpieMcpHandler"]>;

let handler: Promise<McpHandler> | undefined;

async function createHandler(): Promise<McpHandler> {
  const [{ magpieMcpHandler }, { paths }] = await Promise.all([engineMcp(), engineConfig()]);
  return magpieMcpHandler(() => {
    const { store, dataDir } = paths();
    return { store, dir: dataDir };
  });
}

async function serve(request: Request): Promise<Response> {
  if (request.headers.get("origin") !== null) return new Response("Forbidden", { status: 403 });
  handler ??= createHandler().catch((error: unknown) => {
    handler = undefined;
    throw error;
  });
  return (await handler).fetch(request);
}

export const GET = serve;
export const POST = serve;
