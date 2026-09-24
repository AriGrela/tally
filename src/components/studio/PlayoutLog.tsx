"use client";

import { fmtCost, fmtMs, fmtTokens, timecode, totals } from "@/lib/trace";
import type { Span, Trace } from "@/lib/types";

const KIND: Record<Span["kind"], { label: string; color: string }> = {
  run: { label: "RUN", color: "var(--fg)" },
  llm: { label: "LLM", color: "var(--info)" },
  tool: { label: "TOOL", color: "var(--go)" },
  approval: { label: "GATE", color: "var(--warn)" },
  note: { label: "NOTE", color: "var(--dim)" },
};

function statusColor(s: Span): string {
  if (s.status === "error") return "var(--tally)";
  if (s.status === "waiting") return "var(--warn)";
  if (s.status === "denied") return "var(--dim)";
  return KIND[s.kind].color;
}

export function Meters({ trace, nowMs }: { trace: Trace | null; nowMs: number }) {
  const t = trace ? totals(trace) : null;
  const items: [string, string, string?][] = [
    ["TIME", t ? fmtMs(Math.max(t.ms, trace?.status === "running" ? nowMs : 0)) : "—"],
    ["TURNS", t ? String(t.turns) : "—"],
    ["TOOLS", t ? String(t.tools) : "—", t && t.toolErrors ? `${t.toolErrors} failed/denied` : undefined],
    ["TOKENS", t ? `${fmtTokens(t.input + t.cached)} → ${fmtTokens(t.output)}` : "—", t && t.cached ? `${fmtTokens(t.cached)} cached` : undefined],
    ["COST", t ? fmtCost(t.cost) : "—"],
  ];
  return (
    <div className="grid grid-cols-5 border-b border-line bg-panel">
      {items.map(([k, v, sub]) => (
        <div key={k} className="px-3 py-2 border-r border-line last:border-r-0 min-w-0" title={sub}>
          <div className="font-mono text-[9.5px] tracking-[0.2em] text-dim">{k}</div>
          <div className="font-mono text-[13px] tabular-nums truncate mt-0.5">{v}</div>
        </div>
      ))}
    </div>
  );
}

interface Props {
  trace: Trace | null;
  nowMs: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function PlayoutLog({ trace, nowMs, selectedId, onSelect }: Props) {
  if (!trace) {
    return (
      <div className="flex-1 grid place-items-center p-8 text-center">
        <div className="max-w-[280px]">
          <div className="font-mono text-[11px] tracking-[0.2em] text-dim mb-2">PLAYOUT LOG · STANDBY</div>
          <p className="text-[13px] text-muted leading-relaxed">
            Every model turn, tool call and approval of a run shows up here with its timing, tokens and cost. Click a line to inspect it.
          </p>
        </div>
      </div>
    );
  }

  const total = Math.max(
    1,
    trace.status === "running" ? nowMs : 0,
    ...trace.spans.map((s) => s.end ?? (s.status === "running" || s.status === "waiting" ? nowMs : s.start)),
  );
  const depth = (s: Span) => (s.kind === "run" ? 0 : s.kind === "tool" || s.kind === "approval" ? 2 : 1);

  return (
    <div className="flex-1 overflow-y-auto" role="list" aria-label="Playout log">
      {trace.spans.map((s) => {
        const end = s.end ?? (s.status === "running" || s.status === "waiting" ? nowMs : s.start);
        const left = (s.start / total) * 100;
        const width = Math.max(0.6, ((end - s.start) / total) * 100);
        const live = s.status === "running" || s.status === "waiting";
        const color = statusColor(s);
        const sel = selectedId === s.id;
        return (
          <button
            key={s.id}
            role="listitem"
            type="button"
            onClick={() => onSelect(s.id)}
            className={`w-full grid grid-cols-[40px_minmax(0,1fr)_28%_54px] sm:grid-cols-[62px_40px_minmax(0,1fr)_minmax(60px,34%)_58px] items-center gap-2 px-3 h-9 text-left border-b border-line/60 transition-colors ${
              sel ? "bg-panel-3" : "hover:bg-panel-2"
            }`}
          >
            <span className="hidden sm:block font-mono text-[11px] tabular-nums text-dim">{timecode(s.start)}</span>
            <span className="font-mono text-[9.5px] tracking-wider rounded px-1 py-px text-center border" style={{ color, borderColor: `color-mix(in srgb, ${color} 35%, transparent)` }}>
              {s.status === "waiting" ? "HOLD" : KIND[s.kind].label}
            </span>
            <span className="flex items-center gap-2 min-w-0" style={{ paddingLeft: (depth(s) - 1) * 12 }}>
              {depth(s) === 2 && <span className="text-line-2 font-mono text-[11px]">└</span>}
              <span className={`truncate text-[12.5px] ${s.kind === "run" ? "font-semibold" : ""} ${s.status === "denied" ? "text-dim line-through" : ""}`}>
                {s.kind === "tool" || s.kind === "approval" ? <span className="font-mono text-[12px]">{s.name}</span> : s.name}
              </span>
              {s.kind === "llm" && s.usage && (
                <span className="hidden xl:inline font-mono text-[10.5px] text-dim whitespace-nowrap">
                  {fmtTokens(s.usage.outputTokens)} out
                </span>
              )}
            </span>
            <span className="relative h-3.5 rounded-sm bg-panel-2 overflow-hidden">
              <span
                className={`absolute inset-y-0 rounded-sm ${live ? "bar-running" : ""}`}
                style={{ left: `${left}%`, width: `${width}%`, background: color, opacity: s.kind === "run" ? 0.28 : 0.85 }}
              />
            </span>
            <span className="font-mono text-[11px] tabular-nums text-right text-muted">
              {live ? <span style={{ color }}>{s.status === "waiting" ? "hold" : "live"}</span> : fmtMs(end - s.start)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
