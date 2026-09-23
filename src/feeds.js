/**
 * SINGLE SOURCE OF TRUTH for sports data feeds.
 * Derived from CATEGORY_REGISTRY — never hard-code ESPN URLs elsewhere.
 */
import { CATEGORY_REGISTRY, liveCategoryKeys } from "./categoryRegistry.js";

/** @type {Record<string, { url: string, sport: string, key: string }>} */
export const FEEDS = Object.fromEntries(
  Object.values(CATEGORY_REGISTRY)
    .filter((c) => c.liveEnabled && c.feedKey && c.espnUrl)
    .map((c) => [
      c.feedKey,
      {
        url: c.espnUrl,
        sport: c.label.replace(/\s*\(.*\)\s*$/, "").toUpperCase().replace(/\s+/g, ""),
        key: c.key
      }
    ])
);

export function getFeed(key) {
  if (!key) return null;
  const k = String(key).toLowerCase();
  return FEEDS[k] || null;
}

export function liveFeedKeys() {
  return liveCategoryKeys().filter((k) => FEEDS[k]);
}

export function allFeedUrls() {
  return Object.values(FEEDS).map((f) => f.url);
}

/**
 * Shared fetch with timeout, UA, and optional date filter (YYYYMMDD).
 * Returns parsed JSON or throws.
 */
export async function fetchEspnBoard(url, dates = null, timeoutMs = 12000) {
  let u = url;
  if (dates) u += (u.includes("?") ? "&" : "?") + "dates=" + dates;
  const res = await fetch(u, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "User-Agent": "EDGE-PLAY-PICS/4.5 (sports-analytics; +https://github.com/8dwrr29k7f-lang/edge-play-pics)",
      Accept: "application/json"
    }
  });
  if (!res.ok) throw new Error(`ESPN HTTP ${res.status}`);
  return res.json();
}

export function todayYYYYMMDD(tz = "America/Chicago") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  return (
    parts.find((p) => p.type === "year").value +
    parts.find((p) => p.type === "month").value +
    parts.find((p) => p.type === "day").value
  );
}

export function isoNow() {
  return new Date().toISOString();
}

export function nowStamp(tz = "America/Chicago") {
  return new Date().toLocaleString("en-US", { timeZone: tz, hour12: true });
}
