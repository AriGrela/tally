import type { AgentConfig } from "./types";

export interface Template {
  id: string;
  title: string;
  blurb: string;
  agent: AgentConfig;
  task: string;
  /** Sample trace recorded for this template (public/samples/<id>.json). */
  sample?: boolean;
}

const base = { maxSteps: 8, budgetUsd: 0.5, approval: ["send_webhook"] };

export const TEMPLATES: Template[] = [
  {
    id: "weather-desk",
    title: "Outdoor broadcast weather desk",
    blurb: "Go / no-go brief for an outdoor event: rain, gusts, light and call times.",
    sample: true,
    agent: {
      ...base,
      name: "Weather desk",
      instructions:
        "You support the technical director of an outdoor live broadcast. Turn forecasts into operational decisions: rain risk for cameras and cabling, wind gusts for cranes, jibs and LED walls (flag gusts above 40 km/h), sunset time for lighting calls. Be concrete about times.",
      skills: ["brief", "verify-math", "honest"],
      tools: ["weather_forecast", "get_time", "calculator"],
    },
    task: "We have an outdoor stage show in Buenos Aires tomorrow, doors 17:00, live from 19:00 to 22:30. Give me a go/no-go brief for the crew.",
  },
  {
    id: "tech-radar",
    title: "AI tech radar",
    blurb: "What developers are shipping right now, from Hacker News and GitHub.",
    sample: true,
    agent: {
      ...base,
      name: "Tech radar",
      instructions:
        "You are a technology analyst. Find what developers are building and discussing right now, separate hype from traction (stars, recent pushes, discussion volume) and explain why it matters to a small product team.",
      skills: ["cite", "table", "plan"],
      tools: ["hacker_news", "github_search", "github_repo", "web_fetch"],
    },
    task: "What are the hottest AI-agent and MCP projects on GitHub this month, and is anything related on the Hacker News front page today? Give me the top 5 with why they matter.",
  },
  {
    id: "fx-desk",
    title: "FX & pricing desk",
    blurb: "Quote a price in several currencies with exact math.",
    sample: true,
    agent: {
      ...base,
      name: "FX desk",
      instructions:
        "You help a freelancer in Argentina price international work. Convert amounts with live reference rates and show the math. Remind the user that parallel-market and card rates differ from the reference rate.",
      skills: ["verify-math", "table", "rioplatense"],
      tools: ["currency_convert", "calculator", "get_time"],
    },
    task: "Quiero cobrar 1.800 USD por un proyecto. ¿Cuánto es en pesos argentinos, euros y reales? Y si le sumo 21% de IVA, ¿cuánto queda en pesos?",
  },
  {
    id: "researcher",
    title: "Cited researcher",
    blurb: "Short, sourced explainers from Wikipedia and the open web.",
    agent: {
      ...base,
      name: "Researcher",
      instructions:
        "You write short, accurate explainers for a curious non-expert. Read at least two sources before answering and point out where they disagree.",
      skills: ["cite", "honest"],
      tools: ["wikipedia_search", "web_fetch"],
    },
    task: "Explain what the Model Context Protocol is, who created it and how it differs from plain function calling.",
  },
  {
    id: "repo-scout",
    title: "Repo scout",
    blurb: "Compare open-source options before you adopt one.",
    agent: {
      ...base,
      name: "Repo scout",
      instructions:
        "You help an engineer pick an open-source dependency. Compare maintenance signals (last push, release cadence, open issues, license, stars) and recommend one, with the trade-offs.",
      skills: ["table", "cite", "brief"],
      tools: ["github_search", "github_repo"],
    },
    task: "Compare langgraph, crewAI and autogen as agent frameworks. Which one would you pick for a small team today?",
  },
  {
    id: "automation-handoff",
    title: "Automation hand-off",
    blurb: "Research, then send the result to an n8n/Make/Zapier webhook — with human approval.",
    agent: {
      ...base,
      name: "Hand-off",
      instructions:
        "You prepare a short daily digest and hand it to an automation workflow. Build a JSON payload with fields title, summary and links, then send it with send_webhook to the URL the user gives. If no URL is given, show the payload and stop.",
      skills: ["cite", "brief"],
      tools: ["hacker_news", "web_fetch", "send_webhook"],
    },
    task: "Make a 3-item digest of today's top Hacker News stories about AI and send it to my webhook: https://webhook.site/your-id",
  },
];

export const BLANK_AGENT: AgentConfig = {
  ...base,
  name: "Custom agent",
  instructions: "",
  skills: ["cite"],
  tools: ["web_fetch", "wikipedia_search", "calculator", "get_time"],
};
