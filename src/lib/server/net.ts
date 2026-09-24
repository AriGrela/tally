import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const USER_AGENT = "TallyAgentStudio/1.0 (+https://github.com/AriGrela/tally)";

export class ToolError extends Error {}

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT (incl. Tailscale)
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIP(ip: string): boolean {
  if (isIP(ip) === 4) return isPrivateIPv4(ip);
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateIPv4(v6.slice(7));
  return (
    v6 === "::" ||
    v6 === "::1" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") ||
    v6.startsWith("fe8") ||
    v6.startsWith("fe9") ||
    v6.startsWith("fea") ||
    v6.startsWith("feb")
  );
}

/** Reject URLs that point at the server's own network (SSRF guard). */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ToolError(`Invalid URL: ${raw}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ToolError("Only http(s) URLs are allowed");
  }
  if (url.username || url.password) throw new ToolError("URLs with credentials are not allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new ToolError("Private hosts are not allowed");
  }
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addresses.length === 0) throw new ToolError(`Could not resolve ${host}`);
  if (addresses.some((a) => isPrivateIP(a.address))) throw new ToolError("Private network addresses are not allowed");
  return url;
}

interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
  /** Skip the SSRF check for fixed, trusted API hosts. */
  trusted?: boolean;
}

/** fetch with timeout, size cap, manual redirects (each hop re-checked) and a UA. */
export async function safeFetch(raw: string, opts: FetchOptions = {}): Promise<{ status: number; contentType: string; body: string; url: string }> {
  const { timeoutMs = 10_000, maxBytes = 2_000_000 } = opts;
  let current = raw;
  for (let hop = 0; hop < 5; hop++) {
    const url = opts.trusted ? new URL(current) : await assertPublicUrl(current);
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: { "user-agent": USER_AGENT, accept: "*/*", ...opts.headers },
      body: opts.body,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, url).toString();
      continue;
    }
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    const body = new TextDecoder().decode(Buffer.concat(chunks));
    return { status: res.status, contentType: res.headers.get("content-type") ?? "", body, url: url.toString() };
  }
  throw new ToolError("Too many redirects");
}

export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const res = await safeFetch(url, { trusted: true, ...opts, headers: { accept: "application/json", ...opts.headers } });
  if (res.status >= 400) throw new ToolError(`${new URL(url).hostname} answered HTTP ${res.status}`);
  try {
    return JSON.parse(res.body) as T;
  } catch {
    throw new ToolError(`${new URL(url).hostname} returned invalid JSON`);
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** Very small HTML → readable text converter (no DOM on the server). */
export function htmlToText(html: string): { title: string; text: string } {
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "");
  const main = html.match(/<(article|main)[^>]*>([\s\S]*?)<\/\1>/i)?.[2] ?? html;
  const text = decodeEntities(
    main
      .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|li|h[1-6]|tr|pre|blockquote)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<h([1-6])[^>]*>/gi, (_, n) => "\n" + "#".repeat(Number(n)) + " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, text };
}
