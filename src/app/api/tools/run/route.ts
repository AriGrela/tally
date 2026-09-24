import { z } from "zod";
import { clientIp, rateLimit, tooMany } from "@/lib/server/guard";
import { runTool } from "@/lib/server/tools";

export const maxDuration = 30;

const Body = z.object({
  name: z.string().max(64),
  input: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(request: Request) {
  const rl = rateLimit(`tool:${clientIp(request)}`, 60, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfter);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const result = await runTool(parsed.data.name, parsed.data.input);
  return Response.json(result);
}
