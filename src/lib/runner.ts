// Client-side agent loop. The server runs one model turn per request (/api/step)
// and one tool per request (/api/tools/run); the browser owns the loop, so it can
// pause for approvals, stop at any time and record every span of the run.

import { toolMeta } from "./catalog";
import { estimateCost } from "./models";
import { buildSystemPrompt } from "./skills";
import type { AgentConfig, ModelChoice, NativeMessage, Span, StepEvent, StepResult, ToolCall, ToolResult, Trace } from "./types";

export interface RunOptions {
  agent: AgentConfig;
  choice: ModelChoice;
  task: string;
  apiKey?: string;
  accessCode?: string;
  signal: AbortSignal;
}

export interface LiveState {
  text: string;
  thinking: string;
}

export interface RunCallbacks {
  onUpdate: (trace: Trace, live: LiveState) => void;
  requestApproval: (call: ToolCall, spanId: string) => Promise<boolean>;
}

export const uid = (n = 8) =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");

async function readStep(res: Response, onEvent: (e: StepEvent) => void): Promise<void> {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += value;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) onEvent(JSON.parse(line) as StepEvent);
    }
  }
  if (buf.trim()) onEvent(JSON.parse(buf) as StepEvent);
}

export function traceCost(trace: Trace): number | undefined {
  const costs = trace.spans.filter((s) => s.kind === "llm").map((s) => s.costUsd);
  if (costs.length === 0 || costs.some((c) => c === undefined)) return costs.length ? undefined : 0;
  return costs.reduce<number>((a, c) => a + (c ?? 0), 0);
}

export async function runAgent(opts: RunOptions, cb: RunCallbacks): Promise<Trace> {
  const { agent, choice, task, signal } = opts;
  const t0 = performance.now();
  const now = () => Math.round(performance.now() - t0);
  const system = buildSystemPrompt(agent.instructions, agent.skills);

  const root: Span = { id: uid(), kind: "run", name: agent.name, start: 0, status: "running", input: task };
  const trace: Trace = {
    version: 1,
    id: uid(16),
    createdAt: new Date().toISOString(),
    agent: structuredClone(agent),
    choice: { ...choice, baseUrl: choice.provider === "openai-compatible" ? choice.baseUrl : undefined },
    task,
    answer: "",
    status: "running",
    spans: [root],
  };
  const live: LiveState = { text: "", thinking: "" };
  const emit = () => cb.onUpdate({ ...trace, spans: trace.spans.map((s) => ({ ...s })) }, { ...live });
  const finish = (status: Trace["status"], message?: string) => {
    trace.status = status;
    root.status = status === "done" ? "ok" : status === "stopped" ? "denied" : "error";
    root.end = now();
    if (message) root.message = message;
    root.costUsd = traceCost(trace);
    emit();
    return trace;
  };

  let history: NativeMessage[] = [];
  let userText: string | undefined = task;
  let toolResults: ToolResult[] | undefined;
  let spent = 0;
  let lastText = "";

  try {
    for (let step = 1; step <= agent.maxSteps; step++) {
      const span: Span = { id: uid(), parentId: root.id, kind: "llm", name: `turn ${step}`, start: now(), status: "running", model: choice.model };
      trace.spans.push(span);
      live.text = "";
      live.thinking = "";
      emit();

      const res = await fetch("/api/step", {
        method: "POST",
        signal,
        headers: { "content-type": "application/json", ...(opts.apiKey ? { "x-provider-key": opts.apiKey } : {}) },
        body: JSON.stringify({ choice, system, tools: agent.tools, history, userText, toolResults, accessCode: opts.accessCode || undefined }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Step failed (HTTP ${res.status})`);
      }

      let result: StepResult | undefined;
      let failure: string | undefined;
      let lastPaint = 0;
      await readStep(res, (e) => {
        if (e.type === "text") live.text += e.text;
        else if (e.type === "thinking") live.thinking += e.text;
        else if (e.type === "done") result = e.result;
        else if (e.type === "error") failure = e.message;
        if ((e.type === "text" || e.type === "thinking") && performance.now() - lastPaint > 50) {
          lastPaint = performance.now();
          span.output = live.text;
          span.thinking = live.thinking;
          emit();
        }
      });

      span.end = now();
      if (failure || !result) {
        span.status = "error";
        span.message = failure ?? "The model returned no result";
        return finish("error", span.message);
      }

      history = [...history, ...result.appended];
      userText = undefined;
      span.status = result.stopReason === "refusal" ? "error" : "ok";
      span.output = result.text;
      span.thinking = result.thinking;
      span.usage = result.usage;
      span.stopReason = result.stopReason;
      span.model = result.servedBy;
      span.costUsd = estimateCost(choice, result.servedBy, result.usage);
      if (result.fallback) span.message = `Served by ${result.fallback.to} after a fallback from ${result.fallback.from}`;
      if (result.stopReason === "refusal") span.message = "The model declined this request.";
      spent += span.costUsd ?? 0;
      if (result.text) lastText = result.text;

      if (result.toolCalls.length === 0) {
        trace.answer = result.text || (result.stopReason === "refusal" ? "_The model declined this request._" : "");
        if (result.stopReason === "max_tokens") span.message = "Answer cut off at the output limit.";
        return finish("done");
      }

      if (agent.budgetUsd > 0 && spent >= agent.budgetUsd) {
        trace.spans.push({ id: uid(), parentId: root.id, kind: "note", name: "budget reached", start: now(), end: now(), status: "denied", message: `Spent ~$${spent.toFixed(3)} of a $${agent.budgetUsd} budget.` });
        trace.answer = lastText || "_Stopped: budget reached before the agent finished._";
        return finish("stopped", "Budget reached");
      }

      // Tool calls run in parallel. Gated calls first wait for the operator (one
      // approval at a time); the wait is recorded as its own "approval" span.
      const execute = async (call: ToolCall): Promise<ToolResult> => {
        const toolSpan: Span = { id: uid(), parentId: span.id, kind: "tool", name: call.name, start: now(), status: "running", input: call.input };
        trace.spans.push(toolSpan);
        emit();
        const r = await fetch("/api/tools/run", {
          method: "POST",
          signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: call.name, input: call.input }),
        });
        const out = r.ok ? ((await r.json()) as { content: string; isError: boolean }) : { content: `Tool endpoint answered HTTP ${r.status}`, isError: true };
        toolSpan.end = now();
        toolSpan.status = out.isError ? "error" : "ok";
        toolSpan.output = out.content;
        emit();
        return { id: call.id, name: call.name, content: out.content, isError: out.isError };
      };

      let approvals = Promise.resolve();
      toolResults = await Promise.all(
        result.toolCalls.map(async (call): Promise<ToolResult> => {
          const gated = agent.approval.includes(call.name) || !!toolMeta(call.name)?.sideEffect;
          if (!gated) return execute(call);

          const gate: Span = { id: uid(), parentId: span.id, kind: "approval", name: `approve ${call.name}`, start: now(), status: "waiting", input: call.input };
          trace.spans.push(gate);
          emit();
          const turn = approvals.then(() => cb.requestApproval(call, gate.id));
          approvals = turn.then(() => undefined);
          const ok = await turn;
          if (signal.aborted) throw new DOMException("Stopped", "AbortError");
          gate.end = now();
          gate.status = ok ? "ok" : "denied";
          gate.message = ok ? "Approved by the operator" : "Denied by the operator";
          emit();
          if (!ok) return { id: call.id, name: call.name, content: "The operator denied this tool call. Do not retry it; continue without it.", isError: true };
          return execute(call);
        }),
      );
    }

    trace.spans.push({ id: uid(), parentId: root.id, kind: "note", name: "step limit", start: now(), end: now(), status: "denied", message: `Reached the limit of ${agent.maxSteps} turns.` });
    trace.answer = lastText || "_Stopped: the agent hit its step limit before answering._";
    return finish("stopped", "Step limit reached");
  } catch (e) {
    for (const s of trace.spans) {
      if (s.status === "running" || s.status === "waiting") {
        s.status = "denied";
        s.end = now();
      }
    }
    if ((e as Error).name === "AbortError") {
      trace.answer = lastText || live.text;
      return finish("stopped", "Stopped by the operator");
    }
    return finish("error", (e as Error).message);
  }
}
