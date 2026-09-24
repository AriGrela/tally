// Client-safe description of the tools the server can run.
// Implementations live in src/lib/server/tools.ts.

export type ToolCategory = "research" | "data" | "compute" | "action";

export interface ToolMeta {
  name: string;
  label: string;
  description: string;
  category: ToolCategory;
  /** Changes something outside Tally — gated behind approval by default. */
  sideEffect?: boolean;
  source: string;
}

export const TOOL_CATALOG: ToolMeta[] = [
  {
    name: "web_fetch",
    label: "Fetch URL",
    description: "Download a public web page or JSON document and return its readable text.",
    category: "research",
    source: "any public URL",
  },
  {
    name: "wikipedia_search",
    label: "Wikipedia",
    description: "Search Wikipedia (any language) and return the best matching articles with their intro.",
    category: "research",
    source: "wikipedia.org",
  },
  {
    name: "hacker_news",
    label: "Hacker News",
    description: "Read the current top, best, new, Show HN or Ask HN stories with score and comment count.",
    category: "research",
    source: "news.ycombinator.com",
  },
  {
    name: "github_search",
    label: "GitHub search",
    description: "Search public GitHub repositories by keyword, topic or language, sorted by stars or recent activity.",
    category: "research",
    source: "api.github.com",
  },
  {
    name: "github_repo",
    label: "GitHub repo",
    description: "Get stars, activity, topics, license and latest release of a public GitHub repository.",
    category: "research",
    source: "api.github.com",
  },
  {
    name: "weather_forecast",
    label: "Weather",
    description: "Current conditions and a daily forecast (rain, wind gusts, sunrise/sunset) for any place.",
    category: "data",
    source: "open-meteo.com",
  },
  {
    name: "currency_convert",
    label: "FX rates",
    description: "Convert an amount between currencies with today's reference rate (includes ARS).",
    category: "data",
    source: "open.er-api.com",
  },
  {
    name: "get_time",
    label: "Clock",
    description: "Current date and time in any IANA time zone.",
    category: "compute",
    source: "server clock",
  },
  {
    name: "calculator",
    label: "Calculator",
    description: "Evaluate an arithmetic expression exactly instead of doing math in your head.",
    category: "compute",
    source: "local",
  },
  {
    name: "send_webhook",
    label: "Webhook",
    description: "POST a JSON payload to a webhook (n8n, Make, Zapier, Slack…). Has side effects.",
    category: "action",
    sideEffect: true,
    source: "your endpoint",
  },
];

export const TOOL_NAMES = TOOL_CATALOG.map((t) => t.name);

export function toolMeta(name: string): ToolMeta | undefined {
  return TOOL_CATALOG.find((t) => t.name === name);
}
