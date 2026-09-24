import { clientIp, rateLimit, tooMany } from "@/lib/server/guard";
import { runTool, toolDefinitions } from "@/lib/server/tools";

// Stateless remote MCP server (Streamable HTTP transport, JSON responses).
// Exposes the same read-only toolset the studio agents use.

export const maxDuration = 30;

const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
const SERVER_INFO = { name: "tally", title: "Tally tools", version: "1.0.0" };

interface RpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const mcpTools = () => toolDefinitions().filter((t) => !t.meta.sideEffect);

function ok(id: RpcRequest["id"], result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function err(id: RpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

async function handle(msg: RpcRequest) {
  const id = msg.id;
  switch (msg.method) {
    case "initialize": {
      const requested = String(msg.params?.protocolVersion ?? "");
      return ok(id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          "Live, keyless research and data tools: web pages, Wikipedia, Hacker News, GitHub, weather, FX rates, time and a calculator.",
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, {
        tools: mcpTools().map((t) => ({
          name: t.name,
          title: t.meta.label,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { readOnlyHint: true, openWorldHint: t.meta.source !== "local" && t.meta.source !== "server clock" },
        })),
      });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      if (!mcpTools().some((t) => t.name === name)) return err(id, -32602, `Unknown tool: ${name}`);
      const result = await runTool(name, msg.params?.arguments ?? {});
      return ok(id, { content: [{ type: "text", text: result.content }], isError: result.isError });
    }
    default:
      return err(id, -32601, `Method not found: ${msg.method}`);
  }
}

export async function POST(request: Request) {
  const rl = rateLimit(`mcp:${clientIp(request)}`, 60, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfter);

  const body = await request.json().catch(() => undefined);
  if (body === undefined) return Response.json(err(null, -32700, "Parse error"), { status: 400 });

  const batch = Array.isArray(body);
  const messages = (batch ? body : [body]) as RpcRequest[];
  if (messages.length === 0 || messages.length > 20) return Response.json(err(null, -32600, "Invalid request"), { status: 400 });

  const responses = [];
  for (const m of messages) {
    if (!m || m.jsonrpc !== "2.0" || typeof m.method !== "string") {
      responses.push(err(m?.id, -32600, "Invalid request"));
      continue;
    }
    // Notifications (no id) and client responses get no reply.
    if (m.id === undefined || m.id === null) continue;
    responses.push(await handle(m));
  }

  if (responses.length === 0) return new Response(null, { status: 202 });
  return Response.json(batch ? responses : responses[0], { headers: { "cache-control": "no-store" } });
}

export function GET() {
  // No server-initiated stream: this server is stateless.
  return new Response(
    JSON.stringify({ name: SERVER_INFO.name, transport: "streamable-http", endpoint: "/api/mcp", method: "POST" }),
    { status: 405, headers: { allow: "POST", "content-type": "application/json" } },
  );
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
