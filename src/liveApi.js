/** Live API client — OpticOdds backend optional */
import { config } from "./config.js";

const BASE = () => (config.apiBase || "").replace(/\/$/, "");

export async function fetchBestBets() {
  const base = BASE();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api/best-bets`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchPL() {
  const base = BASE();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api/pl`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function refreshData() {
  const base = BASE();
  if (!base) return { ok: false };
  try {
    const res = await fetch(`${base}/api/refresh-data`, { method: "POST", signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { ok: false };
    return await res.json();
  } catch {
    return { ok: false };
  }
}
