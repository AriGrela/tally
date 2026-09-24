import "server-only";
import { timingSafeEqual } from "node:crypto";

// Best-effort, per-instance sliding window. Enough to stop a runaway loop or a
// casual script hammering the public tool endpoints; not a billing control.
const hits = new Map<string, number[]>();

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= limit) {
    hits.set(key, list);
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - list[0])) / 1000) };
  }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return { ok: true, retryAfter: 0 };
}

export function tooMany(retryAfter: number): Response {
  return Response.json(
    { error: "Too many requests, slow down a little." },
    { status: 429, headers: { "retry-after": String(retryAfter) } },
  );
}

/** Constant-time check of the optional access code that unlocks the house keys. */
export function accessCodeOk(code: string | undefined): boolean {
  const expected = process.env.TALLY_ACCESS_CODE;
  if (!expected || !code) return false;
  const a = Buffer.from(code);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function houseKeys() {
  return {
    anthropic: process.env.ANTHROPIC_API_KEY || "",
    compatKey: process.env.TALLY_COMPAT_API_KEY || "",
    compatBaseUrl: process.env.TALLY_COMPAT_BASE_URL || "",
    compatModel: process.env.TALLY_COMPAT_MODEL || "",
  };
}
