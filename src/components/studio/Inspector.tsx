"use client";

import { useState } from "react";
import { fmtCost, fmtMs, fmtTokens, timecode } from "@/lib/trace";
import type { Span } from "@/lib/types";
import { IconCopy, IconX } from "../icons";
import { Markdown } from "../Markdown";

function pretty(v: unknown): string {
  if (typeof v === "string") {
    try {
      return JSON.stringify(JSON.parse(v), null, 2);
    } catch {
      return v;
    }
  }
  return JSON.stringify(v, null, 2);
}

function Block({ title, text, tone }: { title: string; text: string; tone?: "error" }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[10px] tracking-[0.18em] text-dim">{title}</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className="text-dim hover:text-fg inline-flex items-center gap-1 text-[11px]"
        >
          <IconCopy size={12} /> {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className={`font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap break-words rounded-md border border-line bg-bg p-2.5 max-h-72 overflow-auto ${tone === "error" ? "text-tally" : "text-muted"}`}>
        {text}
      </pre>
    </div>
  );
}

export function Inspector({ span, onClose }: { span: Span; onClose: () => void }) {
  const dur = span.end !== undefined ? fmtMs(span.end - span.start) : "running";
  const facts: [string, string][] = [
    ["start", timecode(span.start)],
    ["duration", dur],
    ["status", span.status],
  ];
  if (span.model) facts.push(["model", span.model]);
  if (span.stopReason) facts.push(["stop", span.stopReason]);
  if (span.usage) {
    facts.push(["input", fmtTokens(span.usage.inputTokens + span.usage.cacheWriteTokens)]);
    if (span.usage.cacheReadTokens) facts.push(["cached", fmtTokens(span.usage.cacheReadTokens)]);
    facts.push(["output", fmtTokens(span.usage.outputTokens)]);
  }
  if (span.costUsd !== undefined) facts.push(["cost", fmtCost(span.costUsd)]);

  return (
    <div className="border-t border-line bg-panel flex flex-col min-h-0 max-h-[55%]">
      <div className="flex items-center justify-between px-3 h-9 border-b border-line flex-none">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[10px] tracking-[0.2em] text-dim">INSPECT</span>
          <span className="text-[13px] font-medium truncate">{span.name}</span>
        </div>
        <button type="button" onClick={onClose} className="text-dim hover:text-fg p-1" aria-label="Close inspector">
          <IconX size={14} />
        </button>
      </div>
      <div className="overflow-y-auto p-3 flex flex-col gap-3">
        <dl className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-x-3 gap-y-1.5">
          {facts.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="font-mono text-[9.5px] tracking-[0.16em] text-dim uppercase">{k}</dt>
              <dd className="font-mono text-[12px] truncate" title={v}>
                {v}
              </dd>
            </div>
          ))}
        </dl>
        {span.message && <p className="text-[12.5px] text-warn">{span.message}</p>}
        {span.kind === "run" && typeof span.input === "string" && <Block title="TASK" text={span.input} />}
        {(span.kind === "tool" || span.kind === "approval") && span.input !== undefined && <Block title="INPUT" text={pretty(span.input)} />}
        {span.kind === "tool" && span.output && <Block title="RESULT" text={pretty(span.output)} tone={span.status === "error" ? "error" : undefined} />}
        {span.kind === "llm" && span.thinking && (
          <details className="rounded-md border border-think/25 bg-think/5">
            <summary className="cursor-pointer px-2.5 py-1.5 font-mono text-[10.5px] tracking-[0.16em] text-think">THINKING (SUMMARY)</summary>
            <div className="px-2.5 pb-2.5 text-[12.5px] text-muted whitespace-pre-wrap leading-relaxed">{span.thinking}</div>
          </details>
        )}
        {span.kind === "llm" && span.output && (
          <div>
            <div className="font-mono text-[10px] tracking-[0.18em] text-dim mb-1">TEXT</div>
            <div className="rounded-md border border-line bg-bg p-2.5 max-h-72 overflow-auto">
              <Markdown className="text-[13px]">{span.output}</Markdown>
            </div>
          </div>
        )}
        {span.kind === "llm" && !span.output && span.end !== undefined && (
          <p className="text-[12px] text-dim">This turn only called tools.</p>
        )}
      </div>
    </div>
  );
}
