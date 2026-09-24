"use client";

import { useEffect, useRef, useState } from "react";
import { ANTHROPIC_MODELS, COMPAT_PRESETS } from "@/lib/models";
import type { Effort, ModelChoice } from "@/lib/types";
import { IconLock, IconX } from "../icons";
import { SectionTitle } from "./AgentRack";

export interface Credentials {
  anthropicKey: string;
  compatKey: string;
  accessCode: string;
  remember: boolean;
}

interface Props {
  open: boolean;
  choice: ModelChoice;
  creds: Credentials;
  houseAvailable: boolean;
  onClose: () => void;
  onSave: (choice: ModelChoice, creds: Credentials) => void;
}

const input =
  "w-full rounded-md bg-panel-2 border border-line px-2.5 py-1.5 text-[13px] outline-none focus:border-line-2 placeholder:text-dim";

export function SettingsDialog({ open, choice, creds, houseAvailable, onClose, onSave }: Props) {
  const [c, setC] = useState(choice);
  const [k, setK] = useState(creds);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setC(choice);
      setK(creds);
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open, choice, creds]);

  const compatPreset = COMPAT_PRESETS.find((p) => p.baseUrl === c.baseUrl);
  const anthropicInfo = ANTHROPIC_MODELS.find((m) => m.id === c.model);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(560px,calc(100vw-24px))] max-h-[calc(100dvh-24px)] rounded-xl border border-line-2 bg-panel text-fg p-0 backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <form
        method="dialog"
        onSubmit={() => onSave(c, k)}
        className="flex flex-col max-h-[calc(100dvh-24px)]"
      >
        <header className="flex items-center justify-between px-5 h-12 border-b border-line flex-none">
          <h2 className="text-[14px] font-semibold">Model & keys</h2>
          <button type="button" onClick={onClose} className="text-dim hover:text-fg p-1" aria-label="Close">
            <IconX />
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-4 flex flex-col gap-6">
          <section>
            <SectionTitle>Provider</SectionTitle>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-panel-2 p-1 border border-line">
              {(
                [
                  ["anthropic", "Anthropic (Claude)"],
                  ["openai-compatible", "OpenAI-compatible"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() =>
                    setC(
                      id === "anthropic"
                        ? { provider: "anthropic", model: ANTHROPIC_MODELS[0].id, effort: c.effort ?? "medium" }
                        : { provider: "openai-compatible", model: COMPAT_PRESETS[0].model, baseUrl: COMPAT_PRESETS[0].baseUrl },
                    )
                  }
                  className={`rounded-md py-1.5 text-[13px] transition-colors ${c.provider === id ? "bg-panel-3 text-fg shadow" : "text-muted hover:text-fg"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          {c.provider === "anthropic" ? (
            <section className="flex flex-col gap-3">
              <SectionTitle>Model</SectionTitle>
              <div className="grid gap-1.5">
                {ANTHROPIC_MODELS.map((m) => (
                  <label
                    key={m.id}
                    className={`flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer ${c.model === m.id ? "border-info/50 bg-info/5" : "border-line hover:border-line-2"}`}
                  >
                    <input type="radio" name="model" checked={c.model === m.id} onChange={() => setC({ ...c, model: m.id })} className="accent-[var(--info)]" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px]">{m.label}</span>
                      <span className="block font-mono text-[11px] text-dim">
                        {m.id} · ${m.input}/${m.output} per MTok
                      </span>
                    </span>
                    <span className="text-[11px] text-dim text-right">{m.note}</span>
                  </label>
                ))}
              </div>
              {anthropicInfo?.effort && (
                <div>
                  <div className="text-[12px] text-muted mb-1">Effort</div>
                  <div className="flex gap-1">
                    {(["low", "medium", "high"] as Effort[]).map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => setC({ ...c, effort: e })}
                        className={`flex-1 rounded-md border py-1 text-[12px] capitalize ${(c.effort ?? "medium") === e ? "border-info/50 text-info bg-info/5" : "border-line text-muted hover:text-fg"}`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11.5px] text-dim mt-1.5">Lower effort = fewer thinking tokens and faster turns. Medium is plenty for these tools.</p>
                </div>
              )}
              <label className="block">
                <span className="block text-[12px] text-muted mb-1">Anthropic API key</span>
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="sk-ant-…"
                  value={k.anthropicKey}
                  onChange={(e) => setK({ ...k, anthropicKey: e.target.value.trim() })}
                  className={`${input} font-mono`}
                />
              </label>
            </section>
          ) : (
            <section className="flex flex-col gap-3">
              <SectionTitle>Endpoint</SectionTitle>
              <div className="flex flex-wrap gap-1.5">
                {COMPAT_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setC({ ...c, baseUrl: p.baseUrl, model: p.model })}
                    className={`rounded-full border px-2.5 py-1 text-[12px] ${compatPreset?.id === p.id ? "border-info/50 bg-info/10 text-info" : "border-line text-muted hover:text-fg"}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <label className="block">
                <span className="block text-[12px] text-muted mb-1">Base URL</span>
                <input value={c.baseUrl ?? ""} onChange={(e) => setC({ ...c, baseUrl: e.target.value.trim() })} placeholder="https://…/v1" className={`${input} font-mono`} />
              </label>
              <label className="block">
                <span className="block text-[12px] text-muted mb-1">Model</span>
                <input value={c.model} onChange={(e) => setC({ ...c, model: e.target.value.trim() })} placeholder="model id" className={`${input} font-mono`} />
                <span className="block text-[11.5px] text-dim mt-1">The model must support tool (function) calling.</span>
              </label>
              <label className="block">
                <span className="block text-[12px] text-muted mb-1">API key</span>
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={compatPreset?.keyHint ?? "key"}
                  value={k.compatKey}
                  onChange={(e) => setK({ ...k, compatKey: e.target.value.trim() })}
                  className={`${input} font-mono`}
                />
              </label>
            </section>
          )}

          <section className="rounded-lg border border-line bg-panel-2/60 p-3 flex gap-3">
            <IconLock className="text-go flex-none mt-0.5" />
            <div className="text-[12px] text-muted leading-relaxed">
              Keys stay in this browser and travel only with each request to Tally&apos;s API, which forwards them to the provider and never stores or logs them.
              <label className="flex items-center gap-2 mt-2 text-fg cursor-pointer">
                <input type="checkbox" checked={k.remember} onChange={(e) => setK({ ...k, remember: e.target.checked })} className="accent-[var(--go)]" />
                Remember on this device (otherwise cleared when the tab closes)
              </label>
            </div>
          </section>

          {houseAvailable && (
            <section>
              <SectionTitle>Access code</SectionTitle>
              <input
                type="password"
                autoComplete="off"
                placeholder="Only if the owner gave you one"
                value={k.accessCode}
                onChange={(e) => setK({ ...k, accessCode: e.target.value.trim() })}
                className={`${input} font-mono`}
              />
              <p className="text-[11.5px] text-dim mt-1.5">With a valid code and no key, runs use the owner&apos;s server-side key.</p>
            </section>
          )}
        </div>

        <footer className="flex justify-end gap-2 px-5 py-3 border-t border-line flex-none">
          <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-[13px] text-muted hover:text-fg">
            Cancel
          </button>
          <button type="submit" className="rounded-md bg-fg text-bg px-4 py-1.5 text-[13px] font-medium hover:bg-white">
            Save
          </button>
        </footer>
      </form>
    </dialog>
  );
}
