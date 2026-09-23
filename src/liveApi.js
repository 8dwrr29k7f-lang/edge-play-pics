/**
 * Optional odds / media backend client (EDGE_PLAY_API).
 *
 * When EDGE_PLAY_API is unset, the daily engine uses ESPN public feeds only.
 * When set, this client can enrich odds, media signals, and health probes.
 *
 * Expected backend contract (all optional — failures are soft):
 *   GET  {base}/api/best-bets     → { items: [{ sport, selection, game, odds, edge?, source? }] }
 *   GET  {base}/api/odds?eventId= → { eventId, homeML?, awayML?, openHomeML?, openAwayML? }
 *   GET  {api}/api/media          → { items: [{ source, pick, text, team, selection }] }
 *   GET  {base}/api/pl            → performance summary
 *   POST {base}/api/refresh-data  → { ok: true }
 *   GET  {base}/health            → { ok: true }  (preferred health probe)
 */
import { config } from "./config.js";

const BASE = () => (config.apiBase || "").replace(/\/$/, "");

function timeout(ms) {
  return AbortSignal.timeout(ms);
}

async function getJson(path, ms = 10000) {
  const base = BASE();
  if (!base) return { ok: false, reason: "not_configured", data: null };
  try {
    const res = await fetch(`${base}${path}`, {
      signal: timeout(ms),
      headers: { Accept: "application/json", "User-Agent": "EDGE-PLAY-PICS/4.6" }
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}`, data: null };
    const data = await res.json();
    return { ok: true, reason: null, data };
  } catch (e) {
    return { ok: false, reason: e.message || "unreachable", data: null };
  }
}

export function isOddsBackendConfigured() {
  return Boolean(BASE());
}

export async function fetchBestBets() {
  const r = await getJson("/api/best-bets", 10000);
  if (!r.ok || !r.data) return null;
  return r.data;
}

export async function fetchEventOdds(eventId) {
  if (!eventId) return null;
  const r = await getJson(`/api/odds?eventId=${encodeURIComponent(eventId)}`, 8000);
  if (!r.ok || !r.data) return null;
  return r.data;
}

export async function fetchMediaItems() {
  const r = await getJson("/api/media", 6000);
  if (!r.ok || !r.data) return [];
  const j = r.data;
  return Array.isArray(j?.items) ? j.items : Array.isArray(j) ? j : [];
}

export async function fetchPL() {
  const r = await getJson("/api/pl", 8000);
  if (!r.ok || !r.data) return null;
  return r.data;
}

export async function refreshData() {
  const base = BASE();
  if (!base) return { ok: false, reason: "not_configured" };
  try {
    const res = await fetch(`${base}/api/refresh-data`, {
      method: "POST",
      signal: timeout(15000),
      headers: { Accept: "application/json", "User-Agent": "EDGE-PLAY-PICS/4.6" }
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const data = await res.json().catch(() => ({}));
    return { ok: true, ...data };
  } catch (e) {
    return { ok: false, reason: e.message || "unreachable" };
  }
}

/**
 * Soft-enrich a candidate with backend odds when available.
 * Never fabricates prices — only fills when the backend returns a value.
 */
export async function enrichCandidateOdds(candidate) {
  if (!isOddsBackendConfigured() || !candidate?.eventId) return candidate;
  try {
    const odds = await fetchEventOdds(candidate.eventId);
    if (!odds) return candidate;
    const side = String(candidate.selection || "").toUpperCase();
    let price = candidate.price;
    let openPrice = candidate.openPrice;
    const isHome = /@/.test(candidate.game || "") && side.includes(
      String(candidate.game || "").split("@").pop()?.trim()?.split(/\s/)[0] || "___"
    );
    if (odds.homeML != null || odds.awayML != null) {
      const ml = isHome ? odds.homeML : odds.awayML;
      if (ml != null && ml !== "") {
        const n = Number(ml);
        price = Number.isFinite(n) ? (n > 0 ? `+${n}` : String(n)) : String(ml);
      }
      const open = isHome ? odds.openHomeML : odds.openAwayML;
      if (open != null && open !== "") {
        const n = Number(open);
        openPrice = Number.isFinite(n) ? (n > 0 ? `+${n}` : String(n)) : String(open);
      }
    }
    return {
      ...candidate,
      price: price || candidate.price,
      currentPrice: price || candidate.currentPrice,
      openPrice: openPrice || candidate.openPrice,
      oddsSource: "EDGE_PLAY_API"
    };
  } catch {
    return candidate;
  }
}

/** Health probe used by /status and boot logs */
export async function probeOddsBackend() {
  if (!isOddsBackendConfigured()) {
    return { ok: null, detail: "not configured (ESPN-only mode)" };
  }
  const health = await getJson("/health", 5000);
  if (health.ok) return { ok: true, detail: "reachable (/health)" };
  const bets = await getJson("/api/best-bets", 5000);
  if (bets.ok) return { ok: true, detail: "reachable (/api/best-bets)" };
  return { ok: false, detail: health.reason || bets.reason || "unreachable" };
}
