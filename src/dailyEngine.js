/**
 * DAILY SPORTS ANALYTICS ENGINE
 * SCAN → ANALYZE → FILTER → PUBLISH → MONITOR → UPDATE → REVIEW → LEARN
 */
import { evaluateMatchup } from "./analyticsEngine.js";
import { standardizePick } from "./pickFormat.js";
import { ingestLivePicks } from "./trackerCore.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = path.join(__dirname, "data", "dailyState.json");
const TRACKER_PATH = path.join(__dirname, "data", "tracker.json");

const FEEDS = {
  mlb: { url: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard", sport: "MLB" },
  nfl: { url: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard", sport: "NFL" },
  nba: { url: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard", sport: "NBA" },
  nhl: { url: "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard", sport: "NHL" },
  ncaaf: { url: "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard", sport: "NCAAF" }
};

const MIN_EDGE_LOCK = 3.5;
const MIN_MODEL_LOCK = 0.57;
const MIN_EDGE_LEAN = 1.5;
const MIN_MODEL_LEAN = 0.53;
const STALE_MS = 3 * 60 * 60 * 1000;

function nowStamp() {
  return new Date().toLocaleString("en-US", { timeZone: "America/Chicago", hour12: true });
}
function isoNow() { return new Date().toISOString(); }

function loadState() {
  try {
    if (fs.existsSync(STATE_PATH)) return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {}
  return { date: null, board: null, picks: [], lastScan: null, lastVerify: null };
}
function saveState(state) {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  } catch (e) { console.warn("dailyState save:", e.message); }
}

async function fetchBoard(url, dates) {
  let u = url;
  if (dates) u += (u.includes("?") ? "&" : "?") + "dates=" + dates;
  const res = await fetch(u, { signal: AbortSignal.timeout(12000), headers: { "User-Agent": "EDGE-PLAY-PICS/4.3" } });
  if (!res.ok) throw new Error("ESPN " + res.status);
  return res.json();
}

function todayYYYYMMDD() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return parts.find(p => p.type === "year").value + parts.find(p => p.type === "month").value + parts.find(p => p.type === "day").value;
}

function parseRecord(summary) {
  if (!summary) return null;
  const m = String(summary).match(/(\d+)\s*-\s*(\d+)/);
  if (!m) return null;
  const w = +m[1], l = +m[2], total = w + l;
  if (total < 5) return { w, l, pct: 0.5, thin: true };
  return { w, l, pct: w / total, thin: total < 20 };
}

function buildCtxFromEvent(ev, sportKey) {
  const comp = (ev.competitions || [])[0] || {};
  const statusType = (comp.status || {}).type || {};
  const status = statusType.description || statusType.shortDetail || "—";
  if (/final|postpon|cancel/i.test(status)) return null;
  const competitors = comp.competitors || [];
  let home = null, away = null;
  for (const c of competitors) {
    const team = c.team || {};
    const rec = (c.records || []).find(r => r.type === "total" || r.name === "overall") || (c.records || [])[0];
    const parsed = parseRecord(rec?.summary);
    const obj = {
      abbr: team.abbreviation || team.shortDisplayName || "?",
      name: team.displayName || team.name || "?",
      record: rec?.summary || "—",
      pct: parsed?.pct ?? 0.5,
      thin: parsed?.thin ?? true,
      homeAway: c.homeAway
    };
    if (c.homeAway === "home") home = obj; else away = obj;
  }
  if (!home || !away) return null;
  const game = `${away.abbr} @ ${home.abbr}`;
  const oddsArr = comp.odds || [];
  const price = oddsArr[0]?.details || null;
  const form = `${away.abbr} ${away.record} (pct ${(away.pct * 100).toFixed(0)}%) · ${home.abbr} ${home.record} (pct ${(home.pct * 100).toFixed(0)}%)`;
  const situational = `Public ESPN board · ${status} · ${ev.date || ""} · venue ${(comp.venue || {}).fullName || "—"}`;
  const sampleNote = (away.thin || home.thin) ? "thin sample / limited games in record" : "season record sample available";
  const missing = "No verified injury report, lineup confirmation, or live market depth from this feed. Odds may be unavailable.";
  const mk = (side, other) => ({
    selection: `${side.abbr} ML`,
    game, sport: sportKey.toUpperCase(), price: price || "—", tier: "LEAN",
    form, situational, sampleNote, missing,
    supporting: side.pct >= other.pct + 0.08 ? `${side.abbr} holds stronger season record vs ${other.abbr}` : `Close season records — limited edge from standings alone`,
    opposing: "Record edge alone is weak; injuries/lineups/odds not verified on this scan",
    openPrice: null, currentPrice: price, eventId: ev.id, status,
    analyzedAt: isoNow(), lastVerified: isoNow()
  });
  return { game, sport: sportKey.toUpperCase(), status, candidates: [mk(home, away), mk(away, home)], eventId: ev.id, date: ev.date };
}

export async function dailyScan({ sports = ["mlb", "nfl", "nba", "nhl"] } = {}) {
  const dateKey = todayYYYYMMDD();
  const events = [];
  const errors = [];
  for (const key of sports) {
    const feed = FEEDS[key];
    if (!feed) continue;
    try {
      const data = await fetchBoard(feed.url, dateKey);
      for (const ev of data.events || []) {
        const built = buildCtxFromEvent(ev, key);
        if (built) events.push(built);
      }
    } catch (e) {
      errors.push(`${key}: ${e.message}`);
    }
  }
  return { scannedAt: isoNow(), stamp: nowStamp(), dateKey, eventCount: events.length, events, errors };
}

export function analyzeCandidates(scanResult) {
  const topPlays = [];
  const leans = [];
  const noPlayEvents = [];
  for (const ev of scanResult.events || []) {
    let bestForEvent = null;
    for (const cand of ev.candidates || []) {
      const ctx = {
        sport: cand.sport, selection: cand.selection, game: cand.game, price: cand.price,
        form: cand.form, situational: cand.situational, sampleNote: cand.sampleNote,
        missing: cand.missing, supporting: cand.supporting, opposing: cand.opposing,
        openPrice: cand.openPrice, currentPrice: cand.currentPrice, allowNoOdds: true
      };
      const evRes = evaluateMatchup(ctx);
      const item = {
        ...cand, modelProb: evRes.modelProb, probabilityPct: evRes.probabilityPct,
        edge: evRes.edge, playLevel: evRes.playLevel, playEmoji: evRes.playEmoji,
        dataQuality: evRes.dataQuality, redFlags: evRes.redFlags || [], top3: evRes.top3 || [],
        biggestRisk: evRes.biggestRisk, autopsySurvived: evRes.autopsySurvived,
        marketSignal: evRes.marketSignal, whatIfClassification: evRes.whatIfClassification,
        analyzedAt: cand.analyzedAt, lastVerified: isoNow()
      };
      const isLock =
        evRes.playLevel === "STRONG PLAY" &&
        (evRes.edge == null || evRes.edge >= MIN_EDGE_LOCK) &&
        (evRes.modelProb >= MIN_MODEL_LOCK) &&
        evRes.autopsySurvived !== false &&
        (evRes.dataQuality === "High" || evRes.dataQuality === "Medium") &&
        !(evRes.redFlags || []).some(f => /injury|unknown lineup|missing odds|thin sample/i.test(f));
      if (isLock) {
        item.tier = "LOCK";
        item.playLevel = "STRONG PLAY";
        if (!bestForEvent || (item.edge || 0) > (bestForEvent.edge || 0)) bestForEvent = item;
      } else if (
        (evRes.playLevel === "LEAN" || evRes.playLevel === "STRONG PLAY") &&
        (evRes.modelProb >= MIN_MODEL_LEAN) &&
        (evRes.edge == null || evRes.edge >= MIN_EDGE_LEAN - 1)
      ) {
        item.tier = "LEAN";
        if (!bestForEvent) bestForEvent = item;
      }
    }
    if (bestForEvent?.tier === "LOCK") topPlays.push(bestForEvent);
    else if (bestForEvent?.tier === "LEAN") leans.push(bestForEvent);
    else noPlayEvents.push({ game: ev.game, sport: ev.sport, reason: "Insufficient verified edge / data quality / autopsy" });
  }
  topPlays.sort((a, b) => (b.edge || 0) - (a.edge || 0));
  leans.sort((a, b) => (b.edge || 0) - (a.edge || 0));
  return { topPlays: topPlays.slice(0, 5), leans: leans.slice(0, 8), noPlayEvents: noPlayEvents.slice(0, 20), qualifying: topPlays.length + leans.length > 0 };
}

export function buildDailyBoard(analysis, scanMeta) {
  const lines = [];
  lines.push("━━━━━━━━━━━━━━━━━━");
  lines.push(`📡 DAILY BOARD · ${scanMeta.stamp || nowStamp()} CT`);
  lines.push("━━━━━━━━━━━━━━━━━━");
  lines.push(`Scanned ${scanMeta.eventCount || 0} events · Evidence engine only`);
  lines.push("");
  if (!analysis.qualifying) {
    lines.push("🚫 NO QUALIFYING PLAY TODAY");
    lines.push("No selection met minimum evidence threshold (model + edge + data quality + autopsy).");
    lines.push("Engine will not invent a pick to maintain a streak.");
    return { text: lines.join("\n"), topPlays: [], leans: [], noPlay: true, stamp: scanMeta.stamp, analyzedAt: scanMeta.scannedAt, lastVerified: isoNow() };
  }
  if (analysis.topPlays.length) {
    lines.push("🔥 TOP PLAYS");
    for (const p of analysis.topPlays) {
      lines.push("");
      lines.push("━━━━━━━━━━━━━━━━━━");
      lines.push("🔥 DAILY LOCK");
      lines.push("━━━━━━━━━━━━━━━━━━");
      lines.push(`🎯 PICK: ${p.selection}`);
      lines.push(`📊 MODEL: ${p.probabilityPct != null ? p.probabilityPct + "%" : "—"}`);
      lines.push(`💰 ODDS: ${p.price || "—"}`);
      lines.push(`📈 EDGE: ${p.edge != null ? (p.edge >= 0 ? "+" : "") + p.edge + "%" : "n/a"}`);
      lines.push(`⚠️ RISK: ${p.redFlags?.length ? "HIGH" : p.dataQuality === "High" ? "MEDIUM" : "HIGH"}`);
      lines.push(`📡 DATA: ${p.dataQuality || "LOW"}`);
      lines.push("");
      lines.push("🔥 WHY:");
      for (const r of (p.top3 || []).slice(0, 3)) lines.push(`• ${r}`);
      lines.push("");
      lines.push(`⚠️ BIGGEST RISK: ${p.biggestRisk || "Unverified injuries / lineups / market depth"}`);
      lines.push(`🕐 ANALYZED: ${p.analyzedAt ? new Date(p.analyzedAt).toLocaleString("en-US", { timeZone: "America/Chicago" }) : "—"}`);
      lines.push(`🔄 LAST VERIFIED: ${nowStamp()}`);
    }
  }
  if (analysis.leans.length) {
    lines.push("");
    lines.push("⭐ LEANS");
    for (const p of analysis.leans) {
      lines.push("");
      lines.push("━━━━━━━━━━━━━━━━━━");
      lines.push("⭐ DAILY PLAY");
      lines.push("━━━━━━━━━━━━━━━━━━");
      lines.push(`🎯 PICK: ${p.selection}`);
      lines.push(`📊 MODEL: ${p.probabilityPct != null ? p.probabilityPct + "%" : "—"}`);
      lines.push(`💰 ODDS: ${p.price || "—"}`);
      lines.push(`📈 EDGE: ${p.edge != null ? (p.edge >= 0 ? "+" : "") + p.edge + "%" : "n/a"}`);
      lines.push(`⚠️ RISK: MEDIUM–HIGH`);
      lines.push(`📡 DATA: ${p.dataQuality || "LOW"}`);
      lines.push(`🕐 LAST VERIFIED: ${nowStamp()}`);
    }
  }
  if (analysis.noPlayEvents.length) {
    lines.push("");
    lines.push("🚫 NO PLAY EVENTS (sample)");
    for (const n of analysis.noPlayEvents.slice(0, 5)) lines.push(`• ${n.sport} ${n.game} — ${n.reason}`);
  }
  lines.push("");
  lines.push("_Never guarantees outcomes. Process: scan → analyze → filter → monitor._");
  lines.push("21+ · 1-800-GAMBLER");
  return { text: lines.join("\n"), topPlays: analysis.topPlays, leans: analysis.leans, noPlay: false, stamp: scanMeta.stamp, analyzedAt: scanMeta.scannedAt, lastVerified: isoNow() };
}

export async function runDailyPipeline(opts = {}) {
  const scan = await dailyScan(opts);
  const analysis = analyzeCandidates(scan);
  const board = buildDailyBoard(analysis, scan);
  const state = loadState();
  state.date = scan.dateKey;
  state.board = board;
  state.picks = [...(board.topPlays || []), ...(board.leans || [])];
  state.lastScan = scan.scannedAt;
  state.lastVerify = isoNow();
  saveState(state);
  try {
    const toIngest = (state.picks || []).map((p) => ({
      id: `${scan.dateKey}-${p.sport}-${p.selection}-${p.eventId || ""}`,
      date: scan.dateKey, sport: p.sport, selection: p.selection, market: "ml",
      odds: typeof p.price === "number" ? p.price : 0,
      units: p.tier === "LOCK" ? 1 : 0.5, tier: p.tier, game: p.game, eventId: p.eventId,
      reasoning: p.top3 || []
    }));
    const added = ingestLivePicks(toIngest);
    if (added) console.log("tracker ingest:", added, "new picks");
  } catch (e) {
    console.warn("tracker ingest:", e.message);
  }
  return { scan, analysis, board, state };
}

export async function reverifyPicks() {
  const state = loadState();
  if (!state.picks?.length) return { updates: [], removed: [] };
  const now = Date.now();
  const updates = [];
  const removed = [];
  let needsRescan = false;
  for (const p of state.picks) {
    const analyzed = p.analyzedAt ? new Date(p.analyzedAt).getTime() : 0;
    if (now - analyzed > STALE_MS) {
      p.stale = true;
      needsRescan = true;
      updates.push({
        type: "STALE",
        pick: p.selection,
        message: ["⚠️ STALE — REANALYSIS REQUIRED", `🎯 PICK: ${p.selection}`, `🕐 ANALYZED: ${p.analyzedAt || "—"}`, `🔄 LAST VERIFIED: ${p.lastVerified || "—"}`, "Data older than 3h — do not treat as current.", "Run /scan or wait for next scheduled reverify."].join("\n")
      });
      continue;
    }
    p.lastVerified = isoNow();
  }
  if (needsRescan) {
    const lastRescan = state.lastRescanAt ? new Date(state.lastRescanAt).getTime() : 0;
    if (now - lastRescan > 30 * 60 * 1000) {
      try {
        console.log("reverify: board stale → auto rescan");
        const { board, state: newState } = await runDailyPipeline({ force: true });
        newState.lastRescanAt = isoNow();
        saveState(newState);
        updates.push({
          type: "RESCAN",
          pick: "BOARD",
          message: board?.noPlay
            ? "🔄 AUTO RESCAN complete — NO QUALIFYING PLAY after refresh."
            : `🔄 AUTO RESCAN complete — ${(board?.topPlays || []).length} LOCK / ${(board?.leans || []).length} LEAN refreshed.`
        });
        return { updates, removed, state: newState };
      } catch (e) {
        console.warn("auto rescan failed:", e.message);
        updates.push({ type: "RESCAN_FAIL", pick: "BOARD", message: "🔄 Auto rescan failed: " + e.message });
      }
    }
  }
  state.lastVerify = isoNow();
  saveState(state);
  return { updates, removed, state };
}

export function getCurrentBoard() {
  const state = loadState();
  if (!state.board) return null;
  const verified = state.lastVerify ? new Date(state.lastVerify).getTime() : 0;
  if (Date.now() - verified > STALE_MS) {
    return { ...state.board, stale: true, text: (state.board.text || "") + "\n\n⚠️ STALE — REANALYSIS REQUIRED" };
  }
  return state.board;
}

export function getTrackerSummary() {
  try {
    if (fs.existsSync(TRACKER_PATH)) {
      const t = JSON.parse(fs.readFileSync(TRACKER_PATH, "utf8"));
      const picks = t.picks || [];
      const norm = (r) => String(r || "pending").toLowerCase();
      const pending = picks.filter(p => norm(p.result) === "pending").length;
      const graded = picks.filter(p => ["win", "loss", "push"].includes(norm(p.result)));
      const wins = graded.filter(p => norm(p.result) === "win").length;
      const losses = graded.filter(p => norm(p.result) === "loss").length;
      return { total: picks.length, pending, wins, losses, record: graded.length ? `${wins}-${losses}` : "—" };
    }
  } catch {}
  return { total: 0, pending: 0, wins: 0, losses: 0, record: "—" };
}
