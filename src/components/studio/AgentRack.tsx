"use client";

import { TOOL_CATALOG, type ToolCategory } from "@/lib/catalog";
import { SKILLS } from "@/lib/skills";
import { TEMPLATES } from "@/lib/templates";
import type { AgentConfig } from "@/lib/types";
import { IconHand } from "../icons";

const CATEGORY_LABEL: Record<ToolCategory, string> = {
  research: "Research",
  data: "Live data",
  compute: "Compute",
  action: "Actions",
};

export function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 mb-2">
      <h3 className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-dim">{children}</h3>
      {hint && <span className="text-[11px] text-dim">{hint}</span>}
    </div>
  );
}

interface Props {
  agent: AgentConfig;
  templateId: string | null;
  disabled: boolean;
  onChange: (a: AgentConfig) => void;
  onTemplate: (id: string) => void;
}

export function AgentRack({ agent, templateId, disabled, onChange, onTemplate }: Props) {
  const set = <K extends keyof AgentConfig>(k: K, v: AgentConfig[K]) => onChange({ ...agent, [k]: v });
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <fieldset disabled={disabled} className="flex flex-col gap-6 min-w-0 disabled:opacity-60">
      <section>
        <SectionTitle>Templates</SectionTitle>
        <div className="grid gap-1.5">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTemplate(t.id)}
              className={`group text-left rounded-md border px-3 py-2 transition-colors ${
                templateId === t.id ? "border-line-2 bg-panel-3" : "border-transparent hover:bg-panel-2"
              }`}
            >
              <div className="flex items-center gap-2 text-[13px] font-medium">
                {t.title}
                {t.sample && <span className="font-mono text-[9.5px] tracking-wider text-go/90 border border-go/30 rounded px-1">SAMPLE</span>}
              </div>
              <div className="text-[12px] text-dim leading-snug mt-0.5">{t.blurb}</div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>Agent</SectionTitle>
        <label className="block text-[12px] text-muted mb-1" htmlFor="agent-name">
          Name
        </label>
        <input
          id="agent-name"
          value={agent.name}
          maxLength={60}
          onChange={(e) => set("name", e.target.value)}
          className="w-full rounded-md bg-panel-2 border border-line px-2.5 py-1.5 text-[13px] outline-none focus:border-line-2"
        />
        <label className="block text-[12px] text-muted mt-3 mb-1" htmlFor="agent-role">
          Role & instructions
        </label>
        <textarea
          id="agent-role"
          value={agent.instructions}
          rows={5}
          maxLength={6000}
          placeholder="Who is this agent and what does a good answer look like?"
          onChange={(e) => set("instructions", e.target.value)}
          className="w-full resize-y rounded-md bg-panel-2 border border-line px-2.5 py-2 text-[12.5px] leading-relaxed outline-none focus:border-line-2 placeholder:text-dim"
        />
      </section>

      <section>
        <SectionTitle hint={`${agent.skills.length} on`}>Skills</SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          {SKILLS.map((s) => {
            const on = agent.skills.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                title={s.description}
                aria-pressed={on}
                onClick={() => set("skills", toggle(agent.skills, s.id))}
                className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                  on ? "border-info/50 bg-info/10 text-info" : "border-line text-muted hover:border-line-2 hover:text-fg"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <SectionTitle hint={<span className="inline-flex items-center gap-1"><IconHand size={12} /> = needs approval</span>}>Tools</SectionTitle>
        <div className="flex flex-col gap-3">
          {(["research", "data", "compute", "action"] as ToolCategory[]).map((cat) => (
            <div key={cat}>
              <div className="text-[11px] text-dim mb-1">{CATEGORY_LABEL[cat]}</div>
              <ul className="rounded-md border border-line divide-y divide-line overflow-hidden">
                {TOOL_CATALOG.filter((t) => t.category === cat).map((t) => {
                  const on = agent.tools.includes(t.name);
                  const gated = agent.approval.includes(t.name) || !!t.sideEffect;
                  return (
                    <li key={t.name} className={`flex items-center gap-2 px-2.5 py-1.5 ${on ? "bg-panel-2" : ""}`}>
                      <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer" title={t.description}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => set("tools", toggle(agent.tools, t.name))}
                          className="accent-[var(--go)] size-3.5"
                        />
                        <span className={`text-[12.5px] ${on ? "text-fg" : "text-muted"}`}>{t.label}</span>
                        <span className="font-mono text-[10.5px] text-dim truncate">{t.name}</span>
                      </label>
                      <button
                        type="button"
                        disabled={!!t.sideEffect}
                        onClick={() => set("approval", toggle(agent.approval, t.name))}
                        title={t.sideEffect ? "Side-effect tools always need approval" : gated ? "Runs only after you approve each call" : "Runs automatically"}
                        aria-pressed={gated}
                        className={`rounded p-1 transition-colors disabled:cursor-not-allowed ${gated ? "text-warn" : "text-line-2 hover:text-muted"}`}
                      >
                        <IconHand size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>Guardrails</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[12px] text-muted mb-1">Max turns</span>
            <input
              type="number"
              min={1}
              max={15}
              value={agent.maxSteps}
              onChange={(e) => set("maxSteps", Math.max(1, Math.min(15, Number(e.target.value) || 1)))}
              className="w-full rounded-md bg-panel-2 border border-line px-2.5 py-1.5 text-[13px] font-mono outline-none focus:border-line-2"
            />
          </label>
          <label className="block">
            <span className="block text-[12px] text-muted mb-1">Budget (USD)</span>
            <input
              type="number"
              min={0}
              step={0.05}
              value={agent.budgetUsd}
              onChange={(e) => set("budgetUsd", Math.max(0, Number(e.target.value) || 0))}
              className="w-full rounded-md bg-panel-2 border border-line px-2.5 py-1.5 text-[13px] font-mono outline-none focus:border-line-2"
            />
          </label>
        </div>
        <p className="text-[11.5px] text-dim mt-2 leading-snug">
          The run stops when it hits either limit. Cost is estimated from token usage (Claude models only).
        </p>
      </section>
    </fieldset>
  );
}
