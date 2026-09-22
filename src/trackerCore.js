/** Minimal tracker core so imports succeed */
import fs from "fs";
import path from "path";

const DATA = path.join("src", "data", "tracker.json");

function empty() {
  return { picks: [], seed: { wins: 2, losses: 3, units: -1.86 } };
}

export function load() {
  try {
    return JSON.parse(fs.readFileSync(DATA, "utf8"));
  } catch {
    return empty();
  }
}

export function save(data) {
  try {
    fs.mkdirSync(path.dirname(DATA), { recursive: true });
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
  const r = { id, result: "pending", pl: 0, ...row, created: new Date().toISOString() };
  d.picks = d.picks || [];
  d.picks.unshift(r);
  save(d);
  return r;
}

export function gradePick({ result, id, selection, closingOdds }) {
  const d = load();
  let row = (d.picks || []).find((p) => p.id === id);
  if (!row && selection) row = (d.picks || []).find((p) => p.selection === selection && p.result === "pending");
  if (!row) return null;
  row.result = result;
  row.closingOdds = closingOdds;
  row.pl = plFromResult(row);
  save(d);
  return row;
}

export function plFromResult(row) {
  const u = Number(row.units) || 0;
  const o = Number(row.odds) || 0;
  if (row.result === "win") return o > 0 ? u * (o / 100) : u * (100 / Math.abs(o));
  if (row.result === "loss") return -u;
  return 0;
}

export function listPicks({ limit = 20, pendingOnly = false } = {}) {
  let rows = load().picks || [];
  if (pendingOnly) rows = rows.filter((p) => p.result === "pending");
  return rows.slice(0, limit);
}

export function summaryStats() {
  const d = load();
  const graded = (d.picks || []).filter((p) => p.result && p.result !== "pending");
  const wins = graded.filter((p) => p.result === "win").length;
  const losses = graded.filter((p) => p.result === "loss").length;
  const pushes = graded.filter((p) => p.result === "push").length;
  const units = graded.reduce((s, p) => s + (Number(p.pl) || 0), 0);
  const risked = graded.reduce((s, p) => s + (Number(p.units) || 0), 0);
  const pending = (d.picks || []).filter((p) => p.result === "pending").length;
  const usedSeed = graded.length === 0;
  const seed = d.seed || { wins: 2, losses: 3, units: -1.86 };
  return {
    wins: usedSeed ? seed.wins : wins,
    losses: usedSeed ? seed.losses : losses,
    pushes,
    units: usedSeed ? seed.units : Math.round(units * 100) / 100,
    roi: risked ? Math.round((units / risked) * 1000) / 10 : usedSeed ? -31.6 : 0,
    winPct: wins + losses ? Math.round((wins / (wins + losses)) * 100) : 0,
    graded: graded.length,
    pending,
    usedSeed
  };
}

export function analyzePatterns() {
  const summary = summaryStats();
  return {
    insights: [{ level: "info", text: "Log more graded picks to unlock pattern analysis." }],
    graded: summary.graded,
    summary
  };
}

export function ingestLivePicks() {
  return 0;
}
