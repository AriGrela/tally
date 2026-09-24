// Shared types between the studio (client) and the API routes (server).

export type ProviderId = "anthropic" | "openai-compatible";

export type Effort = "low" | "medium" | "high";

export interface ModelChoice {
  provider: ProviderId;
  model: string;
  /** Only for OpenAI-compatible providers. */
  baseUrl?: string;
  effort?: Effort;
}

export interface AgentConfig {
  name: string;
  instructions: string;
  skills: string[];
  tools: string[];
  /** Tools that pause the run until a human approves the call. */
  approval: string[];
  maxSteps: number;
  /** Stop the run once the estimated spend passes this (USD). 0 = no limit. */
  budgetUsd: number;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  id: string;
  name: string;
  content: string;
  isError: boolean;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** Provider-native messages. The client stores them opaquely and sends them back. */
export type NativeMessage = Record<string, unknown>;

export interface StepRequest {
  choice: ModelChoice;
  system: string;
  tools: string[];
  history: NativeMessage[];
  userText?: string;
  toolResults?: ToolResult[];
  accessCode?: string;
}

export interface StepResult {
  /** Messages to append to the history, in order (user/tool turn + assistant turn). */
  appended: NativeMessage[];
  text: string;
  thinking: string;
  toolCalls: ToolCall[];
  stopReason: string;
  /** Model that actually served the turn (may differ after a fallback). */
  servedBy: string;
  fallback?: { from: string; to: string };
  usage: Usage;
}

export type StepEvent =
  | { type: "start"; model: string }
  | { type: "thinking"; text: string }
  | { type: "text"; text: string }
  | { type: "done"; result: StepResult }
  | { type: "error"; message: string; status?: number };

// ---- Trace ----

export type SpanKind = "run" | "llm" | "tool" | "approval" | "note";
export type SpanStatus = "running" | "ok" | "error" | "denied" | "waiting";

export interface Span {
  id: string;
  parentId?: string;
  kind: SpanKind;
  name: string;
  /** ms since run start */
  start: number;
  end?: number;
  status: SpanStatus;
  model?: string;
  usage?: Usage;
  costUsd?: number;
  stopReason?: string;
  input?: unknown;
  output?: string;
  thinking?: string;
  message?: string;
}

export interface Trace {
  version: 1;
  id: string;
  createdAt: string;
  agent: AgentConfig;
  choice: ModelChoice;
  task: string;
  answer: string;
  status: "running" | "done" | "error" | "stopped";
  spans: Span[];
  /** Present on recorded sample traces. */
  sample?: boolean;
}
