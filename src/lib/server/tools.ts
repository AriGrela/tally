import "server-only";
import { z } from "zod";
import { TOOL_CATALOG, type ToolMeta } from "@/lib/catalog";
import { calculate } from "./calc";
import { ToolError, assertPublicUrl, fetchJson, htmlToText, safeFetch } from "./net";

const MAX_OUTPUT = 12_000;

interface ToolImpl<S extends z.ZodType> {
  schema: S;
  run: (input: z.infer<S>) => Promise<unknown>;
}

function tool<S extends z.ZodType>(schema: S, run: (input: z.infer<S>) => Promise<unknown>): ToolImpl<S> {
  return { schema, run };
}

const WEATHER_CODES: Record<number, string> = {
  0: "clear sky", 1: "mainly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "rime fog",
  51: "light drizzle", 53: "drizzle", 55: "dense drizzle", 56: "freezing drizzle", 57: "freezing drizzle",
  61: "light rain", 63: "rain", 65: "heavy rain", 66: "freezing rain", 67: "freezing rain",
  71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains", 80: "rain showers",
  81: "rain showers", 82: "violent rain showers", 85: "snow showers", 86: "heavy snow showers",
  95: "thunderstorm", 96: "thunderstorm with hail", 99: "thunderstorm with heavy hail",
};

// The webhook tool is an outbound POST, so it only talks to known automation
// hosts (plus any listed in TALLY_WEBHOOK_HOSTS) instead of the whole internet.
const DEFAULT_WEBHOOK_HOSTS = [
  "*.n8n.cloud",
  "*.app.n8n.cloud",
  "hooks.zapier.com",
  "hook.*.make.com",
  "hooks.slack.com",
  "discord.com",
  "webhook.site",
  "*.pipedream.net",
];

export function webhookHosts(): string[] {
  const extra = (process.env.TALLY_WEBHOOK_HOSTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return [...DEFAULT_WEBHOOK_HOSTS, ...extra];
}

function webhookHostAllowed(host: string): boolean {
  return webhookHosts().some((pattern) => {
    const re = new RegExp("^" + pattern.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[a-z0-9-]+") + "$", "i");
    return re.test(host);
  });
}

function githubHeaders(): Record<string, string> {
  const h: Record<string, string> = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" };
  if (process.env.GITHUB_TOKEN) h.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

interface GhRepo {
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  topics?: string[];
  license: { spdx_id: string } | null;
  created_at: string;
  pushed_at: string;
  archived: boolean;
  homepage: string | null;
}

const repoSummary = (r: GhRepo) => ({
  repo: r.full_name,
  description: r.description,
  url: r.html_url,
  stars: r.stargazers_count,
  forks: r.forks_count,
  language: r.language,
  topics: r.topics?.slice(0, 8),
  last_push: r.pushed_at.slice(0, 10),
});

export const TOOLS = {
  web_fetch: tool(
    z.object({
      url: z.string().describe("Absolute http(s) URL to read"),
      max_chars: z.number().int().min(500).max(20_000).optional().describe("Maximum characters to return (default 6000)"),
    }),
    async ({ url, max_chars = 6000 }) => {
      const res = await safeFetch(url);
      if (res.status >= 400) throw new ToolError(`HTTP ${res.status} from ${new URL(res.url).hostname}`);
      if (res.contentType.includes("json")) {
        return { url: res.url, content_type: "json", content: res.body.slice(0, max_chars) };
      }
      const isHtml = res.contentType.includes("html") || /^\s*<(!doctype|html)/i.test(res.body);
      const { title, text } = isHtml ? htmlToText(res.body) : { title: "", text: res.body };
      return {
        url: res.url,
        title,
        content: text.slice(0, max_chars),
        truncated: text.length > max_chars,
      };
    },
  ),

  wikipedia_search: tool(
    z.object({
      query: z.string().min(1).describe("What to look up"),
      lang: z.string().regex(/^[a-z]{2,3}$/).optional().describe("Wikipedia language code, e.g. en, es (default en)"),
      limit: z.number().int().min(1).max(5).optional().describe("Number of articles (default 3)"),
    }),
    async ({ query, lang = "en", limit = 3 }) => {
      const base = `https://${lang}.wikipedia.org/w/api.php`;
      const search = await fetchJson<{ query?: { search: { pageid: number; title: string }[] } }>(
        `${base}?action=query&list=search&format=json&srlimit=${limit}&srsearch=${encodeURIComponent(query)}`,
      );
      const hits = search.query?.search ?? [];
      if (hits.length === 0) return { query, results: [] };
      const pages = await fetchJson<{ query?: { pages: Record<string, { pageid: number; title: string; extract?: string }> } }>(
        `${base}?action=query&prop=extracts&exintro=1&explaintext=1&format=json&pageids=${hits.map((h) => h.pageid).join("|")}`,
      );
      return {
        query,
        results: hits.map((h) => {
          const page = pages.query?.pages[String(h.pageid)];
          return {
            title: h.title,
            url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/ /g, "_"))}`,
            intro: (page?.extract ?? "").slice(0, 1500),
          };
        }),
      };
    },
  ),

  hacker_news: tool(
    z.object({
      list: z.enum(["top", "best", "new", "show", "ask"]).optional().describe("Which list (default top)"),
      limit: z.number().int().min(1).max(30).optional().describe("How many stories (default 10)"),
    }),
    async ({ list = "top", limit = 10 }) => {
      const ids = await fetchJson<number[]>(`https://hacker-news.firebaseio.com/v0/${list}stories.json`);
      const items = await Promise.all(
        ids.slice(0, limit).map((id) =>
          fetchJson<{ id: number; title: string; url?: string; score: number; descendants?: number; by: string; time: number }>(
            `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
          ).catch(() => null),
        ),
      );
      return {
        list,
        stories: items.filter(Boolean).map((s) => ({
          title: s!.title,
          url: s!.url ?? `https://news.ycombinator.com/item?id=${s!.id}`,
          discussion: `https://news.ycombinator.com/item?id=${s!.id}`,
          points: s!.score,
          comments: s!.descendants ?? 0,
          posted: new Date(s!.time * 1000).toISOString().slice(0, 16).replace("T", " "),
        })),
      };
    },
  ),

  github_search: tool(
    z.object({
      query: z.string().min(1).describe('GitHub search query, e.g. "mcp server language:typescript" or "topic:ai-agents"'),
      sort: z.enum(["stars", "updated"]).optional().describe("Sort order (default stars)"),
      limit: z.number().int().min(1).max(10).optional().describe("How many repositories (default 5)"),
    }),
    async ({ query, sort = "stars", limit = 5 }) => {
      const data = await fetchJson<{ total_count: number; items: GhRepo[] }>(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=${sort}&per_page=${limit}`,
        { headers: githubHeaders() },
      );
      return { query, total: data.total_count, repositories: data.items.map(repoSummary) };
    },
  ),

  github_repo: tool(
    z.object({
      repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, "Use owner/name").describe('Repository as "owner/name"'),
    }),
    async ({ repo }) => {
      const r = await fetchJson<GhRepo>(`https://api.github.com/repos/${repo}`, { headers: githubHeaders() });
      const release = await fetchJson<{ tag_name: string; published_at: string }>(
        `https://api.github.com/repos/${repo}/releases/latest`,
        { headers: githubHeaders() },
      ).catch(() => null);
      return {
        ...repoSummary(r),
        open_issues: r.open_issues_count,
        license: r.license?.spdx_id ?? null,
        created: r.created_at.slice(0, 10),
        archived: r.archived,
        homepage: r.homepage || null,
        latest_release: release ? { tag: release.tag_name, date: release.published_at.slice(0, 10) } : null,
      };
    },
  ),

  weather_forecast: tool(
    z.object({
      place: z.string().min(1).describe('City or place, e.g. "Buenos Aires" or "Córdoba, Argentina"'),
      days: z.number().int().min(1).max(10).optional().describe("Forecast days (default 3)"),
    }),
    async ({ place, days = 3 }) => {
      const name = place.split(",")[0].trim();
      const hint = place.split(",").slice(1).join(",").trim().toLowerCase();
      const geo = await fetchJson<{ results?: { name: string; country: string; admin1?: string; latitude: number; longitude: number; timezone: string }[] }>(
        `https://geocoding-api.open-meteo.com/v1/search?count=5&language=en&name=${encodeURIComponent(name)}`,
      );
      const results = geo.results ?? [];
      const loc = results.find((r) => hint && `${r.country} ${r.admin1 ?? ""}`.toLowerCase().includes(hint)) ?? results[0];
      if (!loc) throw new ToolError(`No place found for "${place}"`);
      const f = await fetchJson<{
        timezone: string;
        current: { time: string; temperature_2m: number; relative_humidity_2m: number; wind_speed_10m: number; weather_code: number };
        daily: Record<string, (number | string)[]>;
      }>(
        `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&timezone=auto&forecast_days=${days}` +
          "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code" +
          "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset",
      );
      const d = f.daily;
      return {
        place: [loc.name, loc.admin1, loc.country].filter(Boolean).join(", "),
        timezone: f.timezone,
        units: { temperature: "°C", wind: "km/h", precipitation: "mm" },
        current: {
          time: f.current.time,
          temperature: f.current.temperature_2m,
          humidity: f.current.relative_humidity_2m,
          wind: f.current.wind_speed_10m,
          conditions: WEATHER_CODES[f.current.weather_code] ?? `code ${f.current.weather_code}`,
        },
        daily: (d.time as string[]).map((date, i) => ({
          date,
          conditions: WEATHER_CODES[d.weather_code[i] as number] ?? `code ${d.weather_code[i]}`,
          min: d.temperature_2m_min[i],
          max: d.temperature_2m_max[i],
          rain_chance: d.precipitation_probability_max[i],
          rain_mm: d.precipitation_sum[i],
          wind_max: d.wind_speed_10m_max[i],
          gusts_max: d.wind_gusts_10m_max[i],
          sunrise: String(d.sunrise[i]).slice(11),
          sunset: String(d.sunset[i]).slice(11),
        })),
      };
    },
  ),

  currency_convert: tool(
    z.object({
      from: z.string().regex(/^[A-Za-z]{3}$/).describe("ISO currency code, e.g. USD"),
      to: z.string().regex(/^[A-Za-z]{3}$/).describe("ISO currency code, e.g. ARS"),
      amount: z.number().optional().describe("Amount to convert (default 1)"),
    }),
    async ({ from, to, amount = 1 }) => {
      const data = await fetchJson<{ result: string; rates?: Record<string, number>; time_last_update_utc?: string }>(
        `https://open.er-api.com/v6/latest/${from.toUpperCase()}`,
      );
      const rate = data.rates?.[to.toUpperCase()];
      if (data.result !== "success" || rate === undefined) throw new ToolError(`No rate for ${from}→${to}`);
      return {
        from: from.toUpperCase(),
        to: to.toUpperCase(),
        amount,
        rate,
        converted: Math.round(amount * rate * 100) / 100,
        updated: data.time_last_update_utc,
        note: "Reference mid-market rate; not a bank or parallel-market quote.",
      };
    },
  ),

  get_time: tool(
    z.object({
      timezone: z.string().optional().describe('IANA time zone, e.g. "America/Argentina/Buenos_Aires" (default UTC)'),
    }),
    async ({ timezone = "UTC" }) => {
      const now = new Date();
      let local: string;
      try {
        local = new Intl.DateTimeFormat("en-GB", {
          timeZone: timezone,
          dateStyle: "full",
          timeStyle: "long",
        }).format(now);
      } catch {
        throw new ToolError(`Unknown time zone "${timezone}"`);
      }
      return { timezone, local, utc: now.toISOString() };
    },
  ),

  calculator: tool(
    z.object({
      expression: z.string().min(1).max(500).describe("Arithmetic, e.g. (1250*1.21)/3 or round(sqrt(2), 4). Supports + - * / % ^ and sqrt, abs, round, floor, ceil, ln, log, exp, sin, cos, tan, min, max, pow, pi, e"),
    }),
    async ({ expression }) => {
      try {
        return { expression, result: calculate(expression) };
      } catch (e) {
        throw new ToolError((e as Error).message);
      }
    },
  ),

  send_webhook: tool(
    z.object({
      url: z.string().describe("Webhook URL (https)"),
      payload: z.record(z.string(), z.unknown()).describe("JSON object to send"),
    }),
    async ({ url, payload }) => {
      const target = await assertPublicUrl(url);
      if (target.protocol !== "https:") throw new ToolError("Webhooks must use https");
      if (!webhookHostAllowed(target.hostname)) {
        throw new ToolError(`${target.hostname} is not an allowed webhook host. Allowed: ${webhookHosts().join(", ")}`);
      }
      const body = JSON.stringify(payload);
      if (body.length > 20_000) throw new ToolError("Payload too large (20 KB max)");
      const res = await safeFetch(target.toString(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        maxBytes: 20_000,
      });
      return { delivered: res.status < 400, status: res.status, response: res.body.slice(0, 500) };
    },
  ),
} satisfies Record<string, ToolImpl<z.ZodType>>;

export type ToolName = keyof typeof TOOLS;

export function isToolName(name: string): name is ToolName {
  return Object.hasOwn(TOOLS, name);
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  meta: ToolMeta;
}

/** JSON-Schema definitions, used for the model providers and the MCP server. */
export function toolDefinitions(names?: string[]): ToolDefinition[] {
  return TOOL_CATALOG.filter((m) => !names || names.includes(m.name)).map((meta) => {
    const schema = z.toJSONSchema(TOOLS[meta.name as ToolName].schema) as Record<string, unknown>;
    delete schema.$schema;
    return { name: meta.name, description: meta.description, inputSchema: schema, meta };
  });
}

export interface ToolRun {
  content: string;
  isError: boolean;
  ms: number;
}

export async function runTool(name: string, input: unknown): Promise<ToolRun> {
  const t0 = Date.now();
  const done = (content: string, isError: boolean): ToolRun => ({
    content: content.length > MAX_OUTPUT ? content.slice(0, MAX_OUTPUT) + "\n…[truncated]" : content,
    isError,
    ms: Date.now() - t0,
  });
  if (!isToolName(name)) return done(`Unknown tool "${name}"`, true);
  const impl = TOOLS[name] as ToolImpl<z.ZodType>;
  const parsed = impl.schema.safeParse(input ?? {});
  if (!parsed.success) {
    return done(`Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}`, true);
  }
  try {
    const out = await impl.run(parsed.data);
    return done(typeof out === "string" ? out : JSON.stringify(out, null, 1), false);
  } catch (e) {
    const msg = e instanceof ToolError ? e.message : e instanceof Error && e.name === "TimeoutError" ? "The request timed out" : `Tool failed: ${(e as Error).message}`;
    return done(msg, true);
  }
}
