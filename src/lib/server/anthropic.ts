import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { anthropicModel } from "@/lib/models";
import type { StepEvent, StepRequest, StepResult, ToolCall } from "@/lib/types";
import { toolDefinitions } from "./tools";

// Fallback on policy declines (Claude Opus 5): the API re-runs the turn on the
// model Anthropic recommends for that refusal category instead of refusing.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const FALLBACK_MODELS = new Set(["claude-opus-5"]);

type Emit = (e: StepEvent) => void;

/** A content block type the installed SDK version does not model yet. */
interface FallbackBlock {
  type: "fallback";
  from?: { model?: string };
  to?: { model?: string };
}

const isFallback = (b: { type: string }): b is FallbackBlock & { type: string } => b.type === "fallback";

/**
 * After a mid-output fallback, blocks produced before the last `fallback`
 * marker (thinking, tool_use) must not be echoed back; text blocks may.
 */
function sanitizeForHistory(content: Anthropic.ContentBlock[]): Anthropic.ContentBlockParam[] {
  const blocks = content as unknown as { type: string }[];
  let last = -1;
  blocks.forEach((b, i) => {
    if (isFallback(b)) last = i;
  });
  return blocks
    .filter((b, i) => {
      if (isFallback(b)) return false;
      if (i < last && b.type !== "text") return false;
      return true;
    })
    .map((b) => {
      // Response-only fields (citations: null etc.) are accepted back as-is.
      return b as unknown as Anthropic.ContentBlockParam;
    });
}

export async function anthropicStep(req: StepRequest, apiKey: string, emit: Emit, signal: AbortSignal): Promise<StepResult> {
  const client = new Anthropic({
    apiKey,
    // Pin the public endpoint; a local ANTHROPIC_BASE_URL must not redirect user keys.
    baseURL: "https://api.anthropic.com",
    maxRetries: 2,
  });
  const info = anthropicModel(req.choice.model);
  const model = req.choice.model;

  const appended: Anthropic.MessageParam[] = [];
  if (req.toolResults?.length) {
    appended.push({
      role: "user",
      content: req.toolResults.map((r) => ({
        type: "tool_result" as const,
        tool_use_id: r.id,
        content: r.content,
        is_error: r.isError || undefined,
      })),
    });
  } else if (req.userText) {
    appended.push({ role: "user", content: req.userText });
  }

  const tools: Anthropic.Tool[] = toolDefinitions(req.tools).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
    eager_input_streaming: true,
  }));

  const params: Anthropic.MessageStreamParams = {
    model,
    max_tokens: 32_000,
    system: req.system,
    messages: [...(req.history as unknown as Anthropic.MessageParam[]), ...appended],
    cache_control: { type: "ephemeral" },
    ...(tools.length ? { tools } : {}),
    ...(info?.thinking ? { thinking: { type: "adaptive", display: "summarized" } } : {}),
    ...(info?.effort && req.choice.effort ? { output_config: { effort: req.choice.effort } } : {}),
  };

  const run = async (useFallback: boolean) => {
    const stream = client.messages.stream(
      (useFallback ? { ...params, fallbacks: "default" } : params) as Anthropic.MessageStreamParams,
      { signal, ...(useFallback ? { headers: { "anthropic-beta": FALLBACK_BETA } } : {}) },
    );
    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") emit({ type: "text", text: event.delta.text });
        else if (event.delta.type === "thinking_delta") emit({ type: "thinking", text: event.delta.thinking });
      }
    }
    return stream.finalMessage();
  };

  emit({ type: "start", model });
  let message: Anthropic.Message;
  try {
    message = await run(FALLBACK_MODELS.has(model));
  } catch (e) {
    // If an account can't use the fallback beta, run the turn without it.
    if (FALLBACK_MODELS.has(model) && e instanceof Anthropic.BadRequestError && /fallback/i.test(e.message)) {
      message = await run(false);
    } else throw e;
  }

  const blocks = message.content as unknown as { type: string }[];
  const fb = blocks.filter(isFallback).at(-1) as FallbackBlock | undefined;
  const clean = sanitizeForHistory(message.content);

  const text = clean
    .filter((b): b is Anthropic.TextBlockParam => b.type === "text")
    .map((b) => b.text)
    .join("");
  const thinking = clean
    .filter((b): b is Anthropic.ThinkingBlockParam => b.type === "thinking")
    .map((b) => b.thinking)
    .join("\n\n");
  let toolCalls: ToolCall[] = clean
    .filter((b): b is Anthropic.ToolUseBlockParam => b.type === "tool_use")
    .map((b) => ({ id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> }));

  // A tool input cut off by max_tokens or a refusal must never run.
  if (message.stop_reason === "max_tokens" || message.stop_reason === "refusal") toolCalls = [];

  appended.push({ role: "assistant", content: clean });

  return {
    appended: appended as unknown as StepResult["appended"],
    text,
    thinking,
    toolCalls,
    stopReason: message.stop_reason ?? "unknown",
    servedBy: message.model,
    fallback: fb ? { from: fb.from?.model ?? model, to: fb.to?.model ?? message.model } : undefined,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    },
  };
}

export function describeAnthropicError(e: unknown): { message: string; status?: number } | null {
  if (e instanceof Anthropic.AuthenticationError) return { message: "The Anthropic API key was rejected. Check it in Settings.", status: 401 };
  if (e instanceof Anthropic.PermissionDeniedError) return { message: "This key has no access to that model.", status: 403 };
  if (e instanceof Anthropic.NotFoundError) return { message: "Model not found for this key.", status: 404 };
  if (e instanceof Anthropic.RateLimitError) return { message: "Rate limited or out of credits. Try again later or switch model.", status: 429 };
  if (e instanceof Anthropic.BadRequestError) return { message: `Anthropic rejected the request: ${e.message}`, status: 400 };
  if (e instanceof Anthropic.APIError) return { message: `Anthropic API error ${e.status ?? ""}: ${e.message}`, status: e.status };
  return null;
}
