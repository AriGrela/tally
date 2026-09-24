import Link from "next/link";
import { CopySnippet } from "@/components/CopySnippet";
import { IconBolt, IconGithub, IconHand, IconPlay, IconReplay } from "@/components/icons";
import { Logo } from "@/components/Logo";
import { TOOL_CATALOG } from "@/lib/catalog";
import { AUTHOR, REPO_URL, SITE_URL } from "@/lib/site";

const PREVIEW: { tc: string; kind: string; color: string; name: string; left: number; width: number; dur: string; depth: number }[] = [
  { tc: "00:00:00", kind: "RUN", color: "var(--fg)", name: "Weather desk", left: 0, width: 100, dur: "19.4 s", depth: 0 },
  { tc: "00:00:00", kind: "LLM", color: "var(--info)", name: "turn 1", left: 0, width: 17.4, dur: "3.38 s", depth: 1 },
  { tc: "00:03:09", kind: "TOOL", color: "var(--go)", name: "weather_forecast", left: 17.5, width: 10.4, dur: "2.02 s", depth: 2 },
  { tc: "00:03:09", kind: "TOOL", color: "var(--go)", name: "get_time", left: 17.5, width: 0.4, dur: "4 ms", depth: 2 },
  { tc: "00:05:10", kind: "LLM", color: "var(--info)", name: "turn 2", left: 28, width: 13.9, dur: "2.71 s", depth: 1 },
  { tc: "00:08:04", kind: "TOOL", color: "var(--go)", name: "calculator", left: 42, width: 0.4, dur: "3 ms", depth: 2 },
  { tc: "00:08:04", kind: "LLM", color: "var(--info)", name: "turn 3", left: 42.2, width: 57.8, dur: "11.2 s", depth: 1 },
];

const PILLARS = [
  {
    title: "Compose",
    body: "Agents are a role, a set of skills (small instruction packs like “cite sources” or “verify numbers”) and the live tools they may call. Start from a template or build one in a minute.",
  },
  {
    title: "Run on any model",
    body: "Claude (Opus 5, Sonnet 5, Haiku 4.5) with adaptive thinking and refusal fallback, or any OpenAI-compatible API: OpenAI, Gemini, OpenRouter, Groq, DeepSeek. Bring your own key; it never touches a database.",
  },
  {
    title: "Observe & govern",
    body: "A broadcast-style playout log shows every turn and tool call with timecode, latency, tokens and cost. Gate risky tools behind human approval, cap turns and budget, export OpenTelemetry traces.",
  },
];

const FLOW = [
  { k: "Browser", v: "Owns the agent loop: approvals, limits, stop button, the trace." },
  { k: "/api/step", v: "One model turn per request, streamed back as NDJSON. Keys pass through, never stored." },
  { k: "/api/tools/run", v: "Runs one tool: validated input, SSRF-guarded fetches, timeouts, rate limits." },
  { k: "/api/mcp", v: "The same toolset as a stateless remote MCP server for Claude, Cursor & co." },
];

export default function Home() {
  const mcpUrl = `${SITE_URL}/api/mcp`;
  return (
    <div className="flex flex-col min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/80 backdrop-blur">
        <div className="mx-auto max-w-6xl flex items-center gap-4 px-4 h-14">
          <Logo />
          <nav className="ml-auto flex items-center gap-1 text-[13px]">
            <a href="#mcp" className="hidden sm:inline px-3 py-1.5 text-muted hover:text-fg">MCP</a>
            <a href="#how" className="hidden sm:inline px-3 py-1.5 text-muted hover:text-fg">How it works</a>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="px-3 py-1.5 text-muted hover:text-fg inline-flex items-center gap-1.5">
              <IconGithub size={15} /> <span className="hidden sm:inline">GitHub</span>
            </a>
            <Link href="/studio" className="ml-1 rounded-md bg-fg text-bg px-3.5 py-1.5 font-medium hover:bg-white">
              Open studio
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-line">
          <div className="absolute inset-0 grid-bg opacity-60 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" aria-hidden />
          <div className="relative mx-auto max-w-6xl px-4 pt-16 pb-14 sm:pt-24 sm:pb-20 grid lg:grid-cols-[1.05fr_1fr] gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 font-mono text-[10.5px] tracking-[0.18em] text-muted">
                <span className="lamp" data-state="live" style={{ width: 7, height: 7 }} /> AGENT STUDIO · PLAYOUT LOG · MCP
              </div>
              <h1 className="mt-5 text-4xl sm:text-6xl font-semibold tracking-[-0.03em] leading-[1.02]">
                Agent runs,
                <br />
                <span className="text-tally">on air.</span>
              </h1>
              <p className="mt-5 text-[16px] sm:text-[17px] text-muted leading-relaxed max-w-xl">
                Tally is a small studio for AI agents. Compose one from skills and live tools, run it on Claude or any OpenAI-compatible model with your own
                key, and follow every turn, tool call and approval in a control-room playout log.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/studio" className="inline-flex items-center gap-2 rounded-md bg-fg text-bg px-5 h-11 text-[14px] font-semibold hover:bg-white">
                  <IconPlay size={15} /> Open the studio
                </Link>
                <Link href="/studio?replay=tech-radar" className="inline-flex items-center gap-2 rounded-md border border-line-2 bg-panel px-5 h-11 text-[14px] hover:border-dim">
                  <IconReplay size={15} /> Watch a sample run
                </Link>
              </div>
              <p className="mt-4 text-[12.5px] text-dim">No sign-up. Samples play without a key.</p>
            </div>

            {/* Log preview */}
            <div className="rounded-xl border border-line-2 bg-panel shadow-[0_30px_80px_-20px_rgb(0_0_0/0.8)] overflow-hidden" aria-label="Playout log preview" role="img">
              <div className="flex items-center gap-2 px-3 h-9 border-b border-line">
                <span className="lamp" data-state="done" style={{ width: 8, height: 8 }} />
                <span className="font-mono text-[10px] tracking-[0.2em] text-go">CLEAR</span>
                <span className="ml-auto font-mono text-[10px] tracking-[0.2em] text-dim">PLAYOUT LOG</span>
              </div>
              <div className="grid grid-cols-4 border-b border-line">
                {[
                  ["TIME", "19.4 s"],
                  ["TURNS", "3"],
                  ["TOOLS", "3"],
                  ["COST", "$0.058"],
                ].map(([k, v]) => (
                  <div key={k} className="px-3 py-2 border-r border-line last:border-r-0">
                    <div className="font-mono text-[9px] tracking-[0.2em] text-dim">{k}</div>
                    <div className="font-mono text-[13px]">{v}</div>
                  </div>
                ))}
              </div>
              {PREVIEW.map((r, i) => (
                <div key={i} className="grid grid-cols-[38px_minmax(0,1fr)_30%_48px] sm:grid-cols-[58px_38px_minmax(0,1fr)_38%_50px] items-center gap-2 px-3 h-8 border-b border-line/60 last:border-b-0">
                  <span className="hidden sm:block font-mono text-[10.5px] text-dim">{r.tc}</span>
                  <span className="font-mono text-[9px] tracking-wider rounded border text-center py-px" style={{ color: r.color, borderColor: `color-mix(in srgb, ${r.color} 35%, transparent)` }}>
                    {r.kind}
                  </span>
                  <span className={`truncate text-[12px] ${r.depth === 2 ? "font-mono pl-3 text-muted" : r.depth === 0 ? "font-semibold" : ""}`}>
                    {r.depth === 2 && <span className="text-line-2 mr-1">└</span>}
                    {r.name}
                  </span>
                  <span className="relative h-3 rounded-sm bg-panel-2">
                    <span className="absolute inset-y-0 rounded-sm" style={{ left: `${r.left}%`, width: `${Math.max(r.width, 1)}%`, background: r.color, opacity: r.depth === 0 ? 0.28 : 0.85 }} />
                  </span>
                  <span className="font-mono text-[10.5px] text-right text-muted">{r.dur}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pillars */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20 grid md:grid-cols-3 gap-4">
          {PILLARS.map((p, i) => (
            <div key={p.title} className="rounded-xl border border-line bg-panel p-6">
              <div className="font-mono text-[11px] text-dim">0{i + 1}</div>
              <h2 className="mt-3 text-lg font-semibold tracking-tight">{p.title}</h2>
              <p className="mt-2 text-[14px] text-muted leading-relaxed">{p.body}</p>
            </div>
          ))}
        </section>

        {/* How it works */}
        <section id="how" className="border-y border-line bg-panel/50">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20 grid lg:grid-cols-[1fr_1.2fr] gap-10">
            <div>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">The loop lives in your browser.</h2>
              <p className="mt-4 text-[15px] text-muted leading-relaxed">
                The server is stateless: it runs one model turn or one tool per request. The browser drives the loop, so it can pause for a human, stop on a
                budget and record a complete trace — then share it as a link that carries the whole run, with no database behind it.
              </p>
              <ul className="mt-6 flex flex-col gap-3 text-[14px]">
                <li className="flex gap-3">
                  <IconHand className="text-warn flex-none mt-0.5" size={17} />
                  <span className="text-muted">
                    <span className="text-fg">Human-in-the-loop gates.</span> Mark any tool as “needs approval”. Tools with side effects, like the webhook, always ask.
                  </span>
                </li>
                <li className="flex gap-3">
                  <IconBolt className="text-info flex-none mt-0.5" size={17} />
                  <span className="text-muted">
                    <span className="text-fg">OpenTelemetry out.</span> Export any run as OTLP JSON using the GenAI semantic conventions and load it into your
                    tracing backend.
                  </span>
                </li>
              </ul>
            </div>
            <ol className="grid sm:grid-cols-2 gap-3">
              {FLOW.map((f, i) => (
                <li key={f.k} className="rounded-xl border border-line bg-bg p-5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-dim">{String(i + 1).padStart(2, "0")}</span>
                    <span className="font-mono text-[13px] text-info">{f.k}</span>
                  </div>
                  <p className="mt-2 text-[13.5px] text-muted leading-relaxed">{f.v}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Tools */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">Live tools, no extra keys.</h2>
              <p className="mt-3 text-[15px] text-muted max-w-2xl">Every tool talks to a public API, validates its input with a schema and runs server-side behind timeouts, size caps and a private-network guard.</p>
            </div>
          </div>
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {TOOL_CATALOG.map((t) => (
              <div key={t.name} className="rounded-lg border border-line bg-panel px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-medium">{t.label}</span>
                  <span className="font-mono text-[11px] text-dim">{t.name}</span>
                  {t.sideEffect && <span className="ml-auto font-mono text-[9.5px] tracking-wider text-warn border border-warn/40 rounded px-1">APPROVAL</span>}
                </div>
                <p className="mt-1 text-[13px] text-muted leading-snug">{t.description}</p>
                <p className="mt-1.5 font-mono text-[11px] text-dim">{t.source}</p>
              </div>
            ))}
          </div>
        </section>

        {/* MCP */}
        <section id="mcp" className="border-t border-line bg-panel/50">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20 grid lg:grid-cols-2 gap-10 items-start">
            <div>
              <div className="font-mono text-[11px] tracking-[0.2em] text-info">REMOTE MCP SERVER</div>
              <h2 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight">Plug the same tools into your own agent.</h2>
              <p className="mt-4 text-[15px] text-muted leading-relaxed">
                <code className="font-mono text-[13px] text-fg">/api/mcp</code> speaks the Model Context Protocol over Streamable HTTP. It is stateless and read-only
                (the webhook tool is studio-only), so Claude Code, Claude Desktop, Cursor or any MCP client can use the research and data tools directly.
              </p>
            </div>
            <div className="flex flex-col gap-3 min-w-0">
              <CopySnippet label="CLAUDE CODE" code={`claude mcp add --transport http tally ${mcpUrl}`} />
              <CopySnippet
                label="MCP CLIENT CONFIG (JSON)"
                code={JSON.stringify({ mcpServers: { tally: { type: "http", url: mcpUrl } } }, null, 2)}
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-[13px] text-dim">
          <Logo />
          <span>
            Built by{" "}
            <a href={AUTHOR.portfolio} target="_blank" rel="noreferrer" className="text-muted hover:text-fg underline decoration-line-2 underline-offset-4">
              {AUTHOR.name}
            </a>{" "}
            — media technology, automation and applied AI.
          </span>
          <span className="ml-auto flex gap-4">
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-fg">Source</a>
            <a href={AUTHOR.linkedin} target="_blank" rel="noreferrer" className="hover:text-fg">LinkedIn</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
