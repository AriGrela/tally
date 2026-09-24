import { z } from "zod";
import { TOOL_NAMES } from "@/lib/catalog";
import { describeAnthropicError, anthropicStep } from "@/lib/server/anthropic";
import { accessCodeOk, clientIp, houseKeys, rateLimit, tooMany } from "@/lib/server/guard";
import { CompatError, compatStep } from "@/lib/server/openai-compat";
import type { StepEvent, StepRequest } from "@/lib/types";

export const maxDuration = 300;

const Body = z.object({
  choice: z.object({
    provider: z.enum(["anthropic", "openai-compatible"]),
    model: z.string().min(1).max(120),
    baseUrl: z.string().max(300).optional(),
    effort: z.enum(["low", "medium", "high"]).optional(),
  }),
  system: z.string().max(40_000),
  tools: z.array(z.enum(TOOL_NAMES as [string, ...string[]])).max(TOOL_NAMES.length),
  history: z.array(z.record(z.string(), z.unknown())).max(120),
  userText: z.string().max(20_000).optional(),
  toolResults: z
    .array(z.object({ id: z.string(), name: z.string(), content: z.string().max(40_000), isError: z.boolean() }))
    .max(20)
    .optional(),
  accessCode: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  const rl = rateLimit(`step:${clientIp(request)}`, 40, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfter);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  }
  const req = parsed.data as StepRequest;

  // Keys arrive per request from the browser and are never stored or logged.
  let apiKey = request.headers.get("x-provider-key")?.trim() ?? "";
  if (!apiKey && accessCodeOk(req.accessCode)) {
    const house = houseKeys();
    if (req.choice.provider === "anthropic") apiKey = house.anthropic;
    else if (house.compatKey && house.compatBaseUrl) {
      apiKey = house.compatKey;
      req.choice.baseUrl = house.compatBaseUrl;
    }
  }
  if (!apiKey) {
    return Response.json(
      { error: "No API key. Add your own key in Settings (it stays in your browser), or watch a sample run." },
      { status: 401 },
    );
  }

  const encoder = new TextEncoder();
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: StepEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {
          // client went away
        }
      };
      try {
        const result =
          req.choice.provider === "anthropic"
            ? await anthropicStep(req, apiKey, emit, abort.signal)
            : await compatStep(req, apiKey, emit, abort.signal);
        emit({ type: "done", result });
      } catch (e) {
        const known = describeAnthropicError(e);
        if (known) emit({ type: "error", ...known });
        else if (e instanceof CompatError) emit({ type: "error", message: e.message, status: e.status });
        else if (abort.signal.aborted) emit({ type: "error", message: "Stopped" });
        else emit({ type: "error", message: `Step failed: ${(e as Error).message}` });
      } finally {
        controller.close();
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
