import type { ModelChoice, Usage } from "./types";

export interface ModelInfo {
  id: string;
  label: string;
  /** USD per million tokens */
  input: number;
  output: number;
  cacheRead?: number;
  thinking: boolean;
  effort: boolean;
  note?: string;
}

export const ANTHROPIC_MODELS: ModelInfo[] = [
  { id: "claude-opus-5", label: "Claude Opus 5", input: 5, output: 25, cacheRead: 0.5, thinking: true, effort: true, note: "Most capable · default" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5", input: 2, output: 10, cacheRead: 0.2, thinking: true, effort: true, note: "Fast and cheaper" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", input: 1, output: 5, cacheRead: 0.1, thinking: false, effort: false, note: "Cheapest" },
];

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";

export interface CompatPreset {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  keyHint: string;
}

/** Any provider that speaks the OpenAI Chat Completions format. */
export const COMPAT_PRESETS: CompatPreset[] = [
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-5-mini", keyHint: "sk-…" },
  { id: "gemini", label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash", keyHint: "AIza…" },
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-5-mini", keyHint: "sk-or-…" },
  { id: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b", keyHint: "gsk_…" },
  { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", keyHint: "sk-…" },
];

export function anthropicModel(id: string): ModelInfo | undefined {
  return ANTHROPIC_MODELS.find((m) => m.id === id);
}

/** Estimated cost in USD. Unknown models (OpenAI-compatible) return undefined. */
export function estimateCost(choice: ModelChoice, servedBy: string | undefined, usage: Usage): number | undefined {
  if (choice.provider !== "anthropic") return undefined;
  const m = anthropicModel(servedBy ?? choice.model) ?? anthropicModel(choice.model);
  if (!m) return undefined;
  const cacheWrite = m.input * 1.25;
  return (
    (usage.inputTokens * m.input +
      usage.outputTokens * m.output +
      usage.cacheReadTokens * (m.cacheRead ?? m.input) +
      usage.cacheWriteTokens * cacheWrite) /
    1_000_000
  );
}

export function modelLabel(choice: ModelChoice): string {
  if (choice.provider === "anthropic") return anthropicModel(choice.model)?.label ?? choice.model;
  return choice.model;
}
