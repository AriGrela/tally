import "server-only";
import type { StepEvent, StepRequest, StepResult, ToolCall } from "@/lib/types";
import { assertPublicUrl } from "./net";
import { toolDefinitions } from "./tools";

type Emit = (e: StepEvent) => void;

export class CompatError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

interface Chunk {
  model?: string;
  choices?: {
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      reasoning?: string | null;
      tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[];
    };
    finish_reason?: string | null;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  error?: { message?: string };
}

/** Chat Completions (OpenAI, Gemini, OpenRouter, Groq, DeepSeek, …) with streaming. */
export async function compatStep(req: StepRequest, apiKey: string, emit: Emit, signal: AbortSignal): Promise<StepResult> {
  const base = (req.choice.baseUrl ?? "").replace(/\/+$/, "");
  if (!base) throw new CompatError("Set a base URL for the OpenAI-compatible provider.", 400);
  // Self-hosting on your own machine or tailnet (e.g. Ollama)? Set TALLY_ALLOW_LOCAL_MODELS=1.
  const url =
    process.env.TALLY_ALLOW_LOCAL_MODELS === "1"
      ? new URL(`${base}/chat/completions`)
      : await assertPublicUrl(`${base}/chat/completions`).catch((e: Error) => {
          throw new CompatError(e.message, 400);
        });

  const appended: ChatMessage[] = [];
  if (req.toolResults?.length) {
    for (const r of req.toolResults) {
      appended.push({ role: "tool", tool_call_id: r.id, content: r.isError ? `ERROR: ${r.content}` : r.content });
    }
  } else if (req.userText) {
    appended.push({ role: "user", content: req.userText });
  }

  const tools = toolDefinitions(req.tools).map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));

  const body = {
    model: req.choice.model,
    stream: true,
    stream_options: { include_usage: true },
    messages: [{ role: "system", content: req.system }, ...(req.history as unknown as ChatMessage[]), ...appended],
    ...(tools.length ? { tools } : {}),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      "http-referer": "https://github.com/AriGrela/tally",
      "x-title": "Tally agent studio",
    },
    body: JSON.stringify(body),
    redirect: "error",
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    let detail = text.slice(0, 300);
    try {
      const j = JSON.parse(text);
      detail = j.error?.message ?? j[0]?.error?.message ?? detail;
    } catch {}
    const hint = res.status === 401 ? "The API key was rejected. " : res.status === 429 ? "Rate limited or out of credits. " : "";
    throw new CompatError(`${hint}${url.hostname} answered ${res.status}: ${detail}`, res.status);
  }

  emit({ type: "start", model: req.choice.model });

  let text = "";
  let thinking = "";
  let finish = "stop";
  let servedBy = req.choice.model;
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const calls = new Map<number, { id: string; name: string; args: string }>();

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += value;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      let chunk: Chunk;
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      if (chunk.error) throw new CompatError(chunk.error.message ?? "Provider error");
      if (chunk.model) servedBy = chunk.model;
      if (chunk.usage) {
        const cached = chunk.usage.prompt_tokens_details?.cached_tokens ?? 0;
        usage.inputTokens = (chunk.usage.prompt_tokens ?? 0) - cached;
        usage.cacheReadTokens = cached;
        usage.outputTokens = chunk.usage.completion_tokens ?? 0;
      }
      for (const choice of chunk.choices ?? []) {
        const d = choice.delta;
        if (d?.content) {
          text += d.content;
          emit({ type: "text", text: d.content });
        }
        const r = d?.reasoning_content ?? d?.reasoning;
        if (r) {
          thinking += r;
          emit({ type: "thinking", text: r });
        }
        for (const tc of d?.tool_calls ?? []) {
          const cur = calls.get(tc.index) ?? { id: "", name: "", args: "" };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          calls.set(tc.index, cur);
        }
        if (choice.finish_reason) finish = choice.finish_reason;
      }
    }
  }

  const ordered = [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([, c], i) => ({ ...c, id: c.id || `call_${Date.now()}_${i}` }));
  const toolCalls: ToolCall[] =
    finish === "length"
      ? []
      : ordered.map((c) => {
          let input: Record<string, unknown> = {};
          try {
            input = c.args ? JSON.parse(c.args) : {};
          } catch {
            input = { __invalid_json: c.args };
          }
          return { id: c.id, name: c.name, input };
        });

  appended.push({
    role: "assistant",
    content: text || null,
    ...(ordered.length && finish !== "length"
      ? { tool_calls: ordered.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: c.args || "{}" } })) }
      : {}),
  });

  return {
    appended: appended as unknown as StepResult["appended"],
    text,
    thinking,
    toolCalls,
    stopReason: finish,
    servedBy,
    usage,
  };
}
