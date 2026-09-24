"use client";

import { useState } from "react";
import { IconCheck, IconCopy } from "./icons";

export function CopySnippet({ label, code }: { label: string; code: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="rounded-lg border border-line bg-bg overflow-hidden">
      <div className="flex items-center justify-between px-3 h-8 border-b border-line bg-panel">
        <span className="font-mono text-[10.5px] tracking-[0.16em] text-dim">{label}</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(code);
            setDone(true);
            setTimeout(() => setDone(false), 1400);
          }}
          className="inline-flex items-center gap-1 text-[11.5px] text-dim hover:text-fg"
        >
          {done ? <IconCheck size={13} className="text-go" /> : <IconCopy size={13} />} {done ? "copied" : "copy"}
        </button>
      </div>
      <pre className="p-3 font-mono text-[12.5px] leading-relaxed overflow-x-auto text-muted">{code}</pre>
    </div>
  );
}
