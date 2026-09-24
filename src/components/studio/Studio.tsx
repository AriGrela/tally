"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toolMeta } from "@/lib/catalog";
import { DEFAULT_ANTHROPIC_MODEL, modelLabel } from "@/lib/models";
import { runAgent, type LiveState } from "@/lib/runner";
import { TEMPLATES, BLANK_AGENT } from "@/lib/templates";
import { decodeShare, duration, encodeShare, toOtlp, traceAt } from "@/lib/trace";
import type { AgentConfig, ModelChoice, ToolCall, Trace } from "@/lib/types";
import { IconDownload, IconGear, IconGithub, IconHand, IconPlay, IconReplay, IconShare, IconStop, IconUpload } from "../icons";
import { Logo } from "../Logo";
import { Markdown } from "../Markdown";
import { AgentRack } from "./AgentRack";
import { Inspector } from "./Inspector";
import { Meters, PlayoutLog } from "./PlayoutLog";
import { SettingsDialog, type Credentials } from "./SettingsDialog";

type Mode = "idle" | "running" | "replay" | "view";

interface Pending {
  call: ToolCall;
  spanId: string;
  resolve: (ok: boolean) => void;
}

const SETUP_KEY = "tally:setup";
const CREDS_KEY = "tally:creds";
const DEFAULT_CHOICE: ModelChoice = { provider: "anthropic", model: DEFAULT_ANTHROPIC_MODEL, effort: "medium" };
const EMPTY_CREDS: Credentials = { anthropicKey: "", compatKey: "", accessCode: "", remember: false };

function store(kind: "local" | "session") {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const STATUS: Record<string, { label: string; lamp: "idle" | "live" | "wait" | "done" | "error" }> = {
  standby: { label: "STANDBY", lamp: "idle" },
  live: { label: "ON AIR", lamp: "live" },
  hold: { label: "HOLD · APPROVAL", lamp: "wait" },
  clear: { label: "CLEAR", lamp: "done" },
  stopped: { label: "STOPPED", lamp: "idle" },
  fault: { label: "FAULT", lamp: "error" },
  replay: { label: "REPLAY", lamp: "live" },
};

interface Initial {
  agent: AgentConfig;
  templateId: string | null;
  task: string;
  choice: ModelChoice;
  creds: Credentials;
  trace: Trace | null;
  notice: string | null;
  replay: string | null;
}

/** Read saved setup, credentials, a shared trace (#t=) or a replay request (?replay=). Client-only. */
function loadInitial(): Initial {
  const first = TEMPLATES[0];
  const init: Initial = {
    agent: first.agent,
    templateId: first.id,
    task: first.task,
    choice: DEFAULT_CHOICE,
    creds: EMPTY_CREDS,
    trace: null,
    notice: null,
    replay: null,
  };
  try {
    const saved = store("local")?.getItem(SETUP_KEY);
    if (saved) {
      const s = JSON.parse(saved);
      if (s.agent) init.agent = { ...BLANK_AGENT, ...s.agent };
      if (typeof s.task === "string") init.task = s.task;
      if (s.choice?.provider && s.choice?.model) init.choice = s.choice;
      init.templateId = s.templateId ?? null;
    }
  } catch {}
  try {
    const c = store("local")?.getItem(CREDS_KEY) ?? store("session")?.getItem(CREDS_KEY);
    if (c) init.creds = { ...EMPTY_CREDS, ...JSON.parse(c) };
  } catch {}

  const hash = window.location.hash;
  if (hash.startsWith("#t=")) {
    const t = decodeShare(hash.slice(3));
    if (t) {
      init.trace = t;
      init.agent = t.agent;
      init.task = t.task;
      init.templateId = null;
    } else init.notice = "That share link is damaged or incomplete.";
  }
  const replayId = new URLSearchParams(window.location.search).get("replay");
  if (replayId && TEMPLATES.some((t) => t.id === replayId && t.sample)) init.replay = replayId;
  return init;
}

export function Studio() {
  const [init] = useState(loadInitial);
  const [agent, setAgent] = useState<AgentConfig>(init.agent);
  const [templateId, setTemplateId] = useState<string | null>(init.templateId);
  const [task, setTask] = useState(init.task);
  const [choice, setChoice] = useState<ModelChoice>(init.choice);
  const [creds, setCreds] = useState<Credentials>(init.creds);
  const [house, setHouse] = useState(false);
  const [mode, setMode] = useState<Mode>(init.trace ? "view" : "idle");
  const [trace, setTrace] = useState<Trace | null>(init.trace);
  const [live, setLive] = useState<LiveState>({ text: "", thinking: "" });
  const [replayAnswer, setReplayAnswer] = useState("");
  const [nowMs, setNowMs] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(init.notice);
  const [tab, setTab] = useState<"agent" | "program" | "log">("program");

  const abortRef = useRef<AbortController | null>(null);
  const startRef = useRef(0);
  const rafRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((n) => (n === msg ? null : n)), 3200);
  }, []);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((h) => setHouse(!!(h.houseKeys?.anthropic || h.houseKeys?.compat)))
      .catch(() => {});
    if (init.notice) window.setTimeout(() => setNotice(null), 3200);
  }, [init.notice]);

  useEffect(() => {
    store("local")?.setItem(SETUP_KEY, JSON.stringify({ agent, task, choice, templateId }));
  }, [agent, task, choice, templateId]);

  const saveCreds = (c: Credentials) => {
    setCreds(c);
    store("local")?.removeItem(CREDS_KEY);
    store("session")?.removeItem(CREDS_KEY);
    store(c.remember ? "local" : "session")?.setItem(CREDS_KEY, JSON.stringify(c));
  };

  // ---- clock for live bars ----
  useEffect(() => {
    if (mode !== "running") return;
    const id = window.setInterval(() => setNowMs(Math.round(performance.now() - startRef.current)), 100);
    return () => window.clearInterval(id);
  }, [mode]);

  const apiKey = choice.provider === "anthropic" ? creds.anthropicKey : creds.compatKey;
  const canRun = !!apiKey || (house && !!creds.accessCode);

  const stopReplay = () => cancelAnimationFrame(rafRef.current);

  const run = async () => {
    if (mode === "running") return;
    if (!task.trim()) return flash("Write a task first.");
    if (agent.tools.length === 0) flash("No tools selected — the agent can only answer from memory.");
    if (!canRun) {
      setSettingsOpen(true);
      return flash("Add an API key to run live — or watch a sample run.");
    }
    stopReplay();
    history.replaceState(null, "", window.location.pathname + window.location.search);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    startRef.current = performance.now();
    setNowMs(0);
    setSelectedId(null);
    setLive({ text: "", thinking: "" });
    setMode("running");
    setTab("program");
    const final = await runAgent(
      { agent, choice, task: task.trim(), apiKey: apiKey || undefined, accessCode: creds.accessCode || undefined, signal: ctrl.signal },
      {
        onUpdate: (t, l) => {
          setTrace(t);
          setLive(l);
        },
        requestApproval: (call, spanId) =>
          new Promise<boolean>((resolve) => {
            setPending({ call, spanId, resolve });
            ctrl.signal.addEventListener("abort", () => resolve(false), { once: true });
          }),
      },
    );
    setPending(null);
    setTrace(final);
    setMode("idle");
    abortRef.current = null;
    if (final.status === "error") {
      const msg = final.spans[0]?.message;
      flash(msg ?? "The run failed.");
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    if (mode === "replay") {
      stopReplay();
      setMode("idle");
    }
  };

  const decide = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  const replay = async (id: string) => {
    if (mode === "running") return;
    const res = await fetch(`/samples/${id}.json`).catch(() => null);
    if (!res?.ok) return flash("Sample not available.");
    const sample = (await res.json()) as Trace;
    const tpl = TEMPLATES.find((t) => t.id === id);
    setAgent(sample.agent);
    setTask(sample.task);
    setTemplateId(tpl?.id ?? null);
    setSelectedId(null);
    setTab("program");
    history.replaceState(null, "", window.location.pathname);
    stopReplay();
    const total = duration(sample);
    const speed = total > 40_000 ? total / 30_000 : 1.25;
    const t0 = performance.now();
    setMode("replay");
    const tick = () => {
      const t = (performance.now() - t0) * speed;
      const view = traceAt(sample, t);
      setTrace(view.trace);
      setReplayAnswer(view.answer);
      setNowMs(t);
      if (view.done) {
        setTrace(sample);
        setReplayAnswer(sample.answer);
        setMode("view");
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const skipReplay = () => {
    const id = templateId;
    stopReplay();
    if (!id) return;
    fetch(`/samples/${id}.json`)
      .then((r) => r.json())
      .then((s: Trace) => {
        setTrace(s);
        setReplayAnswer(s.answer);
        setMode("view");
      });
  };

  // ?replay=<template> from the landing page
  useEffect(() => {
    if (!init.replay) return;
    const id = init.replay;
    window.history.replaceState(null, "", window.location.pathname);
    const t = window.setTimeout(() => replay(id), 150);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [init.replay]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const pickTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    stopReplay();
    setAgent(structuredClone(t.agent));
    setTask(t.task);
    setTemplateId(id);
    if (mode !== "running") {
      setMode("idle");
      setTrace(null);
      setSelectedId(null);
    }
    setTab("program");
  };

  const share = async () => {
    if (!trace || trace.status === "running") return;
    const url = `${window.location.origin}/studio#t=${encodeShare(trace)}`;
    try {
      await navigator.clipboard.writeText(url);
      flash(url.length > 30_000 ? "Link copied (it's long — tool outputs were trimmed)." : "Share link copied. The trace lives in the link; nothing is stored.");
    } catch {
      window.prompt("Copy this link", url);
    }
  };

  const importFile = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      if (data?.version !== 1 || !Array.isArray(data.spans)) throw new Error();
      stopReplay();
      setTrace(data as Trace);
      setAgent((data as Trace).agent);
      setTask((data as Trace).task);
      setTemplateId(null);
      setMode("view");
      setSelectedId(null);
    } catch {
      flash("That file is not a Tally trace (export the Tally JSON, not the OTLP one).");
    }
  };

  // ---- derived view state ----
  const status = useMemo(() => {
    if (mode === "replay") return STATUS.replay;
    if (pending) return STATUS.hold;
    if (mode === "running") return STATUS.live;
    if (!trace) return STATUS.standby;
    if (trace.status === "done") return STATUS.clear;
    if (trace.status === "error") return STATUS.fault;
    if (trace.status === "stopped") return STATUS.stopped;
    return STATUS.standby;
  }, [mode, pending, trace]);

  const busy = mode === "running" || mode === "replay";
  const answer = mode === "replay" ? replayAnswer : trace?.answer ?? "";
  const currentLlm = trace && [...trace.spans].reverse().find((s) => s.kind === "llm");
  const streaming = mode === "running" && currentLlm?.status === "running";
  const runningTools = trace?.spans.filter((s) => s.kind === "tool" && s.status === "running") ?? [];
  const selected = trace?.spans.find((s) => s.id === selectedId) ?? null;
  const template = TEMPLATES.find((t) => t.id === templateId);
  const logClock = mode === "replay" ? nowMs : nowMs;

  return (
    <div className="h-dvh flex flex-col bg-bg">
      {/* Top bar */}
      <header className="flex items-center gap-3 px-3 sm:px-4 h-12 border-b border-line bg-panel flex-none">
        <Link href="/" className="flex items-center" aria-label="Tally home">
          <Logo state={status.lamp} />
        </Link>
        <span className="hidden sm:inline font-mono text-[10.5px] tracking-[0.2em] px-2 py-0.5 rounded border" style={{ color: status.lamp === "live" ? "var(--tally)" : status.lamp === "wait" ? "var(--warn)" : status.lamp === "done" ? "var(--go)" : "var(--dim)", borderColor: "currentColor" }}>
          {status.label}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-2 rounded-md border border-line hover:border-line-2 px-2.5 h-8 text-[12.5px] max-w-[46vw]"
          title="Model & keys"
        >
          <span className={`size-1.5 rounded-full flex-none ${canRun ? "bg-go" : "bg-warn"}`} />
          <span className="truncate">{modelLabel(choice)}</span>
          {choice.provider === "anthropic" && choice.effort && <span className="hidden md:inline text-dim">· {choice.effort}</span>}
          <IconGear size={14} className="text-dim flex-none" />
        </button>
        <div className="hidden md:flex items-center gap-1">
          <button type="button" onClick={share} disabled={!trace || busy} className="p-2 rounded-md text-muted hover:text-fg hover:bg-panel-2 disabled:opacity-30" title="Copy share link">
            <IconShare />
          </button>
          <details className="relative">
            <summary className={`list-none p-2 rounded-md text-muted hover:text-fg hover:bg-panel-2 cursor-pointer ${!trace || busy ? "pointer-events-none opacity-30" : ""}`} title="Export trace">
              <IconDownload />
            </summary>
            <div className="absolute right-0 mt-1 w-56 rounded-lg border border-line-2 bg-panel-2 p-1 z-20 shadow-xl">
              <button type="button" className="w-full text-left rounded px-2.5 py-2 text-[12.5px] hover:bg-panel-3" onClick={() => trace && download(`tally-${trace.id.slice(0, 8)}.otlp.json`, toOtlp(trace))}>
                OpenTelemetry (OTLP JSON)
                <span className="block text-[11px] text-dim">GenAI semantic conventions</span>
              </button>
              <button type="button" className="w-full text-left rounded px-2.5 py-2 text-[12.5px] hover:bg-panel-3" onClick={() => trace && download(`tally-${trace.id.slice(0, 8)}.json`, trace)}>
                Tally trace (JSON)
                <span className="block text-[11px] text-dim">Re-open it here with Import</span>
              </button>
            </div>
          </details>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="p-2 rounded-md text-muted hover:text-fg hover:bg-panel-2 disabled:opacity-30" title="Import a Tally trace">
            <IconUpload />
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
          <a href="https://github.com/AriGrela/tally" target="_blank" rel="noreferrer" className="p-2 rounded-md text-muted hover:text-fg hover:bg-panel-2" title="Source on GitHub">
            <IconGithub />
          </a>
        </div>
      </header>

      {/* Mobile tabs */}
      <nav className="lg:hidden grid grid-cols-3 border-b border-line bg-panel flex-none" aria-label="Sections">
        {(["agent", "program", "log"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`h-10 font-mono text-[11px] tracking-[0.18em] uppercase border-b-2 ${tab === t ? "border-tally text-fg" : "border-transparent text-dim"}`}>
            {t === "log" && trace ? `log · ${trace.spans.length}` : t}
          </button>
        ))}
      </nav>

      <main className="flex-1 min-h-0 grid lg:grid-cols-[290px_minmax(0,1fr)_minmax(360px,38%)] xl:grid-cols-[310px_minmax(0,1fr)_minmax(420px,38%)]">
        {/* Agent rack */}
        <aside className={`${tab === "agent" ? "block" : "hidden"} lg:block min-h-0 overflow-y-auto border-r border-line bg-panel/60 p-4`}>
          <AgentRack agent={agent} templateId={templateId} disabled={busy} onChange={(a) => { setAgent(a); setTemplateId(null); }} onTemplate={pickTemplate} />
        </aside>

        {/* Program */}
        <section className={`${tab === "program" ? "flex" : "hidden"} lg:flex flex-col min-h-0 min-w-0`}>
          <div className="p-4 border-b border-line flex-none">
            <label htmlFor="task" className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-dim">
              Task for {agent.name || "the agent"}
            </label>
            <textarea
              id="task"
              value={task}
              rows={3}
              maxLength={4000}
              disabled={busy}
              onChange={(e) => setTask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  run();
                }
              }}
              placeholder="What should the agent do?"
              className="mt-1.5 w-full resize-y rounded-lg bg-panel-2 border border-line px-3 py-2.5 text-[14px] leading-relaxed outline-none focus:border-line-2 placeholder:text-dim disabled:opacity-70"
            />
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {busy ? (
                <>
                  <button type="button" onClick={stop} className="inline-flex items-center gap-2 rounded-md bg-tally text-white px-4 h-9 text-[13px] font-medium hover:brightness-110">
                    <IconStop size={14} /> Stop
                  </button>
                  {mode === "replay" && (
                    <button type="button" onClick={skipReplay} className="rounded-md border border-line px-3 h-9 text-[13px] text-muted hover:text-fg">
                      Skip to end
                    </button>
                  )}
                </>
              ) : (
                <button type="button" onClick={run} className="inline-flex items-center gap-2 rounded-md bg-fg text-bg px-4 h-9 text-[13px] font-semibold hover:bg-white">
                  <IconPlay size={14} /> Run live
                </button>
              )}
              {!busy && template?.sample && (
                <button type="button" onClick={() => replay(template.id)} className="inline-flex items-center gap-2 rounded-md border border-line hover:border-line-2 px-3 h-9 text-[13px]">
                  <IconReplay size={14} /> Watch sample run
                </button>
              )}
              <span className="ml-auto hidden sm:inline text-[11.5px] text-dim">
                {canRun ? (
                  <>
                    <kbd className="font-mono">Ctrl</kbd>+<kbd className="font-mono">Enter</kbd> to run
                  </>
                ) : (
                  <button type="button" onClick={() => setSettingsOpen(true)} className="underline decoration-dotted underline-offset-2 hover:text-fg">
                    Add a key to run live
                  </button>
                )}
              </span>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
            {mode === "view" && trace && (
              <div className="mb-4 rounded-lg border border-line bg-panel-2/70 px-3 py-2 text-[12.5px] text-muted flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-[10px] tracking-[0.18em] text-info">{trace.sample ? "SAMPLE RUN" : "RECORDED RUN"}</span>
                <span>
                  {modelLabel(trace.choice)} · {new Date(trace.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  {trace.sample && " · real tool results; model turns scripted for the demo"}
                </span>
              </div>
            )}

            {pending && (
              <div className="mb-5 rounded-xl border border-warn/40 bg-warn/5 p-4" role="alertdialog" aria-labelledby="gate-title">
                <div className="flex items-center gap-2 text-warn">
                  <IconHand />
                  <h3 id="gate-title" className="font-semibold text-[14px]">
                    Approval needed: <span className="font-mono">{pending.call.name}</span>
                  </h3>
                </div>
                <p className="text-[12.5px] text-muted mt-1">{toolMeta(pending.call.name)?.description}</p>
                <pre className="mt-3 font-mono text-[12px] rounded-md border border-line bg-bg p-3 max-h-60 overflow-auto whitespace-pre-wrap break-words">
                  {JSON.stringify(pending.call.input, null, 2)}
                </pre>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => decide(true)} className="rounded-md bg-go text-black px-4 h-9 text-[13px] font-semibold hover:brightness-110">
                    Approve & run
                  </button>
                  <button type="button" onClick={() => decide(false)} className="rounded-md border border-line px-4 h-9 text-[13px] hover:border-line-2">
                    Deny
                  </button>
                </div>
              </div>
            )}

            {answer ? (
              <article>
                <div className="font-mono text-[10.5px] tracking-[0.2em] text-dim mb-3">PROGRAM OUT</div>
                <Markdown className={mode === "replay" ? "caret" : ""}>{answer}</Markdown>
              </article>
            ) : mode === "running" ? (
              <div className="flex flex-col gap-4">
                {streaming && live.thinking && !live.text && (
                  <div className="rounded-lg border border-think/20 bg-think/5 px-3 py-2">
                    <div className="font-mono text-[10px] tracking-[0.18em] text-think mb-1">THINKING</div>
                    <p className="text-[12.5px] text-muted leading-relaxed line-clamp-4">{live.thinking.slice(-420)}</p>
                  </div>
                )}
                {streaming && live.text && (
                  <div>
                    <div className="font-mono text-[10.5px] tracking-[0.2em] text-dim mb-3">{currentLlm?.name.toUpperCase()}</div>
                    <Markdown className="caret">{live.text}</Markdown>
                  </div>
                )}
                {runningTools.length > 0 && (
                  <ul className="flex flex-col gap-1.5">
                    {runningTools.map((s) => (
                      <li key={s.id} className="flex items-center gap-2 text-[13px] text-muted">
                        <span className="lamp" data-state="live" style={{ width: 7, height: 7 }} />
                        Calling <span className="font-mono text-fg">{s.name}</span>
                        <span className="font-mono text-[11.5px] text-dim truncate">{JSON.stringify(s.input)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {streaming && !live.text && !live.thinking && <p className="text-[13px] text-dim">Waiting for the first tokens…</p>}
              </div>
            ) : mode === "replay" ? (
              <p className="text-[13px] text-dim">Replaying — watch the playout log fill up.</p>
            ) : trace?.status === "error" ? (
              <div className="rounded-lg border border-tally/40 bg-tally/5 p-4 text-[13px]">
                <div className="font-mono text-[10.5px] tracking-[0.18em] text-tally mb-1">FAULT</div>
                {trace.spans[0]?.message ?? "The run failed."}
              </div>
            ) : (
              <EmptyProgram onReplay={template?.sample ? () => replay(template.id) : undefined} />
            )}
          </div>
        </section>

        {/* Log */}
        <section className={`${tab === "log" ? "flex" : "hidden"} lg:flex flex-col min-h-0 min-w-0 border-l border-line bg-panel/40`}>
          <Meters trace={trace} nowMs={logClock} />
          <div className="flex items-center justify-between px-3 h-8 border-b border-line flex-none">
            <span className="font-mono text-[10px] tracking-[0.2em] text-dim">PLAYOUT LOG</span>
            {trace && <span className="font-mono text-[10px] text-dim">{trace.spans.length} events</span>}
          </div>
          <PlayoutLog trace={trace} nowMs={logClock} selectedId={selectedId} onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))} />
          {selected && <Inspector span={selected} onClose={() => setSelectedId(null)} />}
        </section>
      </main>

      {notice && (
        <div role="status" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 max-w-[calc(100vw-32px)] rounded-lg border border-line-2 bg-panel-3 px-4 py-2.5 text-[13px] shadow-2xl">
          {notice}
        </div>
      )}

      <SettingsDialog
        open={settingsOpen}
        choice={choice}
        creds={creds}
        houseAvailable={house}
        onClose={() => setSettingsOpen(false)}
        onSave={(c, k) => {
          setChoice(c);
          saveCreds(k);
          setSettingsOpen(false);
        }}
      />
    </div>
  );
}

function EmptyProgram({ onReplay }: { onReplay?: () => void }) {
  return (
    <div className="h-full grid place-items-center">
      <div className="max-w-md text-center">
        <div className="font-mono text-[10.5px] tracking-[0.24em] text-dim">PROGRAM · NO SIGNAL</div>
        <h2 className="mt-3 text-xl font-semibold tracking-tight">Compose an agent, then put it on air.</h2>
        <p className="mt-2 text-[13.5px] text-muted leading-relaxed">
          Pick a template or build your own from skills and tools on the left. Run it with your own Claude or OpenAI-compatible key, or watch a recorded sample
          first — every step lands in the playout log.
        </p>
        {onReplay && (
          <button type="button" onClick={onReplay} className="mt-5 inline-flex items-center gap-2 rounded-md border border-line hover:border-line-2 px-4 h-9 text-[13px]">
            <IconReplay size={14} /> Watch the sample run
          </button>
        )}
      </div>
    </div>
  );
}
