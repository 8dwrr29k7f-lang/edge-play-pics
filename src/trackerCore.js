/**
 * Tracker core — single ledger for log / grade / summary
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, "data", "tracker.json");

function empty() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    notes: "Self-learning ledger. /logpick /grade /track /review.",
    seed: { wins: 2, losses: 3, units: -1.86, roiPct: -31.6 },
    picks: []
  };
}

function normalizeResult(r) {
  const s = String(r || "pending").toLowerCase();
  if (s === "win" || s === "won") return "win";
  if (s === "loss" || s === "lost" || s === "lose") return "loss";
  if (s === "push" || s === "void") return "push";
  return "pending";
}

export function load() {
  try {
    if (!fs.existsSync(DATA)) return empty();
    const d = JSON.parse(fs.readFileSync(DATA, "utf8"));
    d.picks = (d.picks || []).map((p) => ({
      ...p,
      result: normalizeResult(p.result)
    }));
    return d;
  } catch {
    return empty();
  }
}

export function save(data) {
  try {
    fs.mkdirSync(path.dirname(DATA), { recursive: true });
    data.updatedAt = new Date().toISOString();
    fs.writeFileSync(DATA, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn("tracker save:", e.message);
  }
}

export function ensureSeedFile() {
  if (!fs.existsSync(DATA)) save(empty());
}

export function logPick(row) {
  const d = load();
  const id = "p" + Date.now().toString(36);
  const r = {
    id,
    result: "pending",
    pl: 0,
    sport: String(row.sport || "").slice(0, 32),
    selection: String(row.selection || "").slice(0, 120),
    odds: Number(row.odds) || 0,
    units: Number(row.units) || 0,
    label: String(row.label || "LEAN").slice(0, 16),
    market: String(row.market || "ml").slice(0, 16),
    game: String(row.game || "").slice(0, 80),
    reasons: String(row.reasons || "").slice(0, 200),
    created: new Date().toISOString()
  };
  d.picks = d.picks || [];
  d.picks.unshift(r);
  // Cap ledger size to avoid unbounded growth
  if (d.picks.length > 500) d.picks = d.picks.slice(0, 500);
  save(d);
  return r;
}

export function gradePick({ result, id, selection, closingOdds }) {
  const d = load();
  const want = normalizeResult(result);
  if (want === "pending") return null;
  let row = (d.picks || []).find((p) => p.id === id);
  if (!row && selection) {
    row = (d.picks || []).find(
      (p) =>
        p.selection === selection && normalizeResult(p.result) === "pending"
    );
  }
  if (!row) return null;
  row.result = want;
  if (closingOdds != null) row.closingOdds = Number(closingOdds);
  row.pl = plFromResult(row);
  row.gradedAt = new Date().toISOString();
  save(d);
  return row;
}

export function plFromResult(row) {
  const u = Number(row.units) || 0;
  const o = Number(row.odds) || 0;
  const res = normalizeResult(row.result);
  if (res === "win") return o > 0 ? u * (o / 100) : u * (100 / Math.abs(o || 100));
  if (res === "loss") return -u;
  return 0;
}

export function listPicks({ limit = 20, pendingOnly = false } = {}) {
  let rows = load().picks || [];
  if (pendingOnly) rows = rows.filter((p) => normalizeResult(p.result) === "pending");
  return rows.slice(0, limit);
}

export function summaryStats() {
  const d = load();
  const graded = (d.picks || []).filter((p) => {
    const r = normalizeResult(p.result);
    return r === "win" || r === "loss" || r === "push";
  });
  const wins = graded.filter((p) => normalizeResult(p.result) === "win").length;
  const losses = graded.filter((p) => normalizeResult(p.result) === "loss").length;
  const pushes = graded.filter((p) => normalizeResult(p.result) === "push").length;
  const units = graded.reduce((s, p) => s + (Number(p.pl) || 0), 0);
  const risked = graded.reduce((s, p) => s + (Number(p.units) || 0), 0);
  const pending = (d.picks || []).filter((p) => normalizeResult(p.result) === "pending").length;
  const usedSeed = graded.length === 0;
  const seed = d.seed || d.seedSummary || { wins: 2, losses: 3, units: -1.86, roiPct: -31.6 };
  return {
    wins: usedSeed ? seed.wins : wins,
    losses: usedSeed ? seed.losses : losses,
    pushes,
    units: usedSeed ? seed.units : Math.round(units * 100) / 100,
    roi: risked
      ? Math.round((units / risked) * 1000) / 10
      : usedSeed
        ? seed.roiPct ?? -31.6
        : 0,
    winPct: wins + losses ? Math.round((wins / (wins + losses)) * 100) : 0,
    graded: graded.length,
    pending,
    usedSeed
  };
}

export function analyzePatterns() {
  const summary = summaryStats();
  const insights = [];
  if (summary.usedSeed) {
    insights.push({
      level: "info",
      text: "Day-1 seed only — log and grade real legs to unlock calibration insights."
    });
  } else if (summary.graded < 10) {
    insights.push({
      level: "info",
      text: `Only ${summary.graded} graded legs — treat ROI as noise until ≥20 decisions.`
    });
  } else {
    if (summary.roi < -15) {
      insights.push({
        level: "warn",
        text: `ROI ${summary.roi}% is poor — tighten LOCK gates or reduce unit size.`
      });
    } else if (summary.roi > 5) {
      insights.push({
        level: "good",
        text: `ROI ${summary.roi}% positive across ${summary.graded} legs — maintain process, avoid forcing volume.`
      });
    } else {
      insights.push({
        level: "info",
        text: `ROI ${summary.roi}% near break-even — process is stable; edge is thin.`
      });
    }
  }
  insights.push({
    level: "info",
    text: "Never rewrite graded history. Pending stays pending until /grade."
  });
  return { insights, graded: summary.graded, summary };
}

export function ingestLivePicks(picks = []) {
  if (!Array.isArray(picks) || !picks.length) return 0;
  const d = load();
  let added = 0;
  for (const p of picks) {
    const sel = p.selection || p.pick;
    if (!sel) continue;
    const id =
      p.id ||
      `${p.date || "x"}-${p.sport || ""}-${sel}-${p.eventId || ""}`;
    if ((d.picks || []).find((x) => x.id === id)) continue;
    d.picks = d.picks || [];
    d.picks.unshift({
      id,
      result: "pending",
      pl: 0,
      sport: p.sport || "",
      selection: sel,
      odds: Number(p.odds) || 0,
      units: Number(p.units) || (p.tier === "LOCK" ? 1 : 0.5),
      label: p.tier || p.label || "LEAN",
      market: p.market || "ml",
      game: p.game || "",
      reasons: Array.isArray(p.reasoning) ? p.reasoning.join("; ") : String(p.reasons || ""),
      created: new Date().toISOString()
    });
    added++;
  }
  if (added) {
    if (d.picks.length > 500) d.picks = d.picks.slice(0, 500);
    save(d);
  }
  return added;
}
