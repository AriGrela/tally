import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import type { Span, Trace } from "./types";

// ---- OpenTelemetry export (OTLP/JSON, GenAI semantic conventions) ----

type Attr = { key: string; value: { stringValue?: string; intValue?: string; doubleValue?: number } };

const s = (key: string, v: string | undefined): Attr[] => (v === undefined ? [] : [{ key, value: { stringValue: v } }]);
const i = (key: string, v: number | undefined): Attr[] => (v === undefined ? [] : [{ key, value: { intValue: String(v) } }]);
const d = (key: string, v: number | undefined): Attr[] => (v === undefined ? [] : [{ key, value: { doubleValue: v } }]);

const hex = (id: string, len: number) => id.replace(/[^0-9a-f]/gi, "").padEnd(len, "0").slice(0, len);

export function toOtlp(trace: Trace) {
  const base = BigInt(Date.parse(trace.createdAt)) * BigInt(1_000_000);
  const ns = (ms: number) => String(base + BigInt(Math.round(ms * 1_000_000)));
  const system = trace.choice.provider === "anthropic" ? "anthropic" : "openai";
  const spanName = (sp: Span) =>
    sp.kind === "llm" ? `chat ${sp.model ?? trace.choice.model}` : sp.kind === "tool" ? `execute_tool ${sp.name}` : sp.kind === "run" ? `invoke_agent ${sp.name}` : sp.name;
  return {
    resourceSpans: [
      {
        resource: { attributes: [...s("service.name", "tally"), ...s("service.version", "1.0.0")] },
        scopeSpans: [
          {
            scope: { name: "tally.agent", version: "1.0.0" },
            spans: trace.spans.map((sp) => ({
              traceId: hex(trace.id, 32),
              spanId: hex(sp.id, 16),
              ...(sp.parentId ? { parentSpanId: hex(sp.parentId, 16) } : {}),
              name: spanName(sp),
              kind: sp.kind === "llm" || sp.kind === "tool" ? 3 : 1,
              startTimeUnixNano: ns(sp.start),
              endTimeUnixNano: ns(sp.end ?? sp.start),
              status: { code: sp.status === "ok" ? 1 : sp.status === "error" ? 2 : 0, ...(sp.message ? { message: sp.message } : {}) },
              attributes: [
                ...s("gen_ai.operation.name", sp.kind === "llm" ? "chat" : sp.kind === "tool" ? "execute_tool" : sp.kind === "run" ? "invoke_agent" : undefined),
                ...(sp.kind === "llm" || sp.kind === "run" ? s("gen_ai.system", system) : []),
                ...(sp.kind === "llm" ? s("gen_ai.request.model", trace.choice.model) : []),
                ...(sp.kind === "llm" ? s("gen_ai.response.model", sp.model) : []),
                ...(sp.kind === "run" ? s("gen_ai.agent.name", sp.name) : []),
                ...(sp.kind === "tool" ? s("gen_ai.tool.name", sp.name) : []),
                ...i("gen_ai.usage.input_tokens", sp.usage ? sp.usage.inputTokens + sp.usage.cacheReadTokens + sp.usage.cacheWriteTokens : undefined),
                ...i("gen_ai.usage.output_tokens", sp.usage?.outputTokens),
                ...s("gen_ai.response.finish_reasons", sp.stopReason),
                ...d("tally.cost_usd", sp.costUsd),
                ...s("tally.status", sp.status),
              ],
            })),
          },
        ],
      },
    ],
  };
}

// ---- Share links: the whole trace lives in the URL hash, nothing is stored ----

const clip = (v: string | undefined, n: number) => (v && v.length > n ? v.slice(0, n) + "…" : v);

export function encodeShare(trace: Trace): string {
  const slim: Trace = {
    ...trace,
    answer: clip(trace.answer, 8000) ?? "",
    spans: trace.spans.map((sp) => ({
      ...sp,
      output: clip(sp.output, sp.kind === "tool" ? 1200 : 2500),
      thinking: clip(sp.thinking, 1200),
    })),
  };
  return compressToEncodedURIComponent(JSON.stringify(slim));
}

export function decodeShare(hash: string): Trace | null {
  try {
    const json = decompressFromEncodedURIComponent(hash);
    if (!json) return null;
    const t = JSON.parse(json) as Trace;
    return t?.version === 1 && Array.isArray(t.spans) ? t : null;
  } catch {
    return null;
  }
}

// ---- Replay: the trace as it looked `t` ms into the run ----

export function traceAt(trace: Trace, t: number): { trace: Trace; answer: string; done: boolean } {
  const total = duration(trace);
  const spans = trace.spans
    .filter((sp) => sp.start <= t)
    .map((sp) => {
      const end = sp.end ?? sp.start;
      if (end <= t) return sp;
      const frac = end > sp.start ? (t - sp.start) / (end - sp.start) : 1;
      return {
        ...sp,
        end: undefined,
        status: sp.kind === "tool" || sp.kind === "llm" || sp.kind === "run" ? ("running" as const) : sp.status,
        usage: undefined,
        costUsd: undefined,
        output: sp.kind === "llm" && sp.output ? sp.output.slice(0, Math.floor(sp.output.length * frac)) : sp.kind === "llm" ? sp.output : undefined,
        thinking: sp.thinking?.slice(0, Math.floor(sp.thinking.length * Math.min(1, frac * 2))),
      };
    });
  const done = t >= total;
  const lastLlm = [...trace.spans].reverse().find((sp) => sp.kind === "llm");
  let answer = "";
  if (lastLlm && t >= lastLlm.start) {
    const end = lastLlm.end ?? lastLlm.start;
    const frac = t >= end ? 1 : (t - lastLlm.start) / Math.max(1, end - lastLlm.start);
    answer = trace.answer.slice(0, Math.floor(trace.answer.length * frac));
  }
  return { trace: { ...trace, spans, status: done ? trace.status : "running" }, answer, done };
}

export function duration(trace: Trace): number {
  return trace.spans.reduce((m, sp) => Math.max(m, sp.end ?? sp.start), 0);
}

export function totals(trace: Trace) {
  let input = 0;
  let output = 0;
  let cached = 0;
  let cost: number | undefined = 0;
  for (const sp of trace.spans) {
    if (sp.kind !== "llm") continue;
    if (sp.usage) {
      input += sp.usage.inputTokens + sp.usage.cacheWriteTokens;
      cached += sp.usage.cacheReadTokens;
      output += sp.usage.outputTokens;
    }
    if (sp.costUsd === undefined) {
      if (sp.usage) cost = undefined;
    } else if (cost !== undefined) cost += sp.costUsd;
  }
  return {
    turns: trace.spans.filter((sp) => sp.kind === "llm").length,
    tools: trace.spans.filter((sp) => sp.kind === "tool").length,
    toolErrors: trace.spans.filter((sp) => sp.kind === "tool" && (sp.status === "error" || sp.status === "denied")).length,
    input,
    output,
    cached,
    cost,
    ms: duration(trace),
  };
}

export function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

/** Broadcast-style timecode: MM:SS:FF at 25 fps. */
export function timecode(ms: number): string {
  const totalFrames = Math.floor(ms / 40);
  const ff = totalFrames % 25;
  const ss = Math.floor(totalFrames / 25) % 60;
  const mm = Math.floor(totalFrames / 1500);
  return [mm, ss, ff].map((n) => String(n).padStart(2, "0")).join(":");
}

export function fmtTokens(n: number): string {
  return n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString("en-US");
}

export function fmtCost(c: number | undefined): string {
  if (c === undefined) return "n/a";
  if (c === 0) return "$0";
  return c < 0.01 ? `$${c.toFixed(4)}` : `$${c.toFixed(3)}`;
}
