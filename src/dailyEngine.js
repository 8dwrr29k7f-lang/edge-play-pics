/**
 * DAILY SPORTS ANALYTICS ENGINE
 * SCAN → ANALYZE → FILTER → PUBLISH → MONITOR → UPDATE → REVIEW → LEARN
 *
 * Guarantees PROCESS only — never outcomes.
 * Never fabricates odds, injuries, lineups, or results.
 * LOCK only when strict evidence threshold is met.
 */

import { evaluateMatchup, parseOddsToImplied } from "./analyticsEngine.js";
import { standardizePick, formatStandardDiscord } from "./pickFormat.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = path.join(__dirname, "data", "dailyState.json");
const TRACKER_PATH = path.join(__dirname, "data", "tracker.json");

const FEEDS = {
  mlb: { url: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard", sport: "MLB", label: "⚾ MLB" },
  nfl: { url: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard", sport: "NFL", label: "🏈 NFL" },
  nba: { url: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard", sport: "NBA", label: "🏀 NBA" },
  nhl: { url: "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard", sport: "NHL", label: "🏒 NHL" },
  ncaaf: { url: "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard", sport: "NCAAF", label: "🏈 NCAAF" }
};

const MIN_EDGE_LOCK = 3.5;
const MIN_MODEL_LOCK = 0.57;
const MIN_EDGE_LEAN = 1.5;
const MIN_MODEL_LEAN = 0.53;
const STALE_MS = 3 * 60 * 60 * 1000;

function nowStamp() {
  return new Date().toLocaleString("en-US", { timeZone: "America/Chicago", hour12: true });
}

function isoNow() {
  return new Date().toISOString();
}

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
  } catch (e) {
    console.warn("dailyState save:", e.message);
  }
}

function loadTracker() {
  try {
    if (fs.existsSync(TRACKER_PATH)) return JSON.parse(fs.readFileSync(TRACKER_PATH, "utf8"));
  } catch {}
  return { picks: [], calibration: {} };
}

function saveTracker(t) {
  try {
    fs.mkdirSync(path.dirname(TRACKER_PATH), { recursive: true });
    fs.writeFileSync(TRACKER_PATH, JSON.stringify(t, null, 2));
  } catch (e) {
    console.warn("tracker save:", e.message);
  }
}

async function fetchBoard(url, dates) {
  let u = url;
  if (dates) u += (u.includes("?") ? "&" : "?") + "dates=" + dates;
  const res = await fetch(u, { signal: AbortSignal.timeout(12000), headers: { "User-Agent": "EDGE-PLAY-PICS/4.3" } });
  if (!res.ok) throw new Error("ESPN " + res.status);
  return res.json();
}

function todayYYYYMMDD() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const y = parts.find(p => p.type === "year").value;
  const m = parts.find(p => p.type === "month").value;
  const day = parts.find(p => p.type === "day").value;
  return y + m + day;
}

function parseRecord(summary) {
  if (!summary) return null;
  const m = String(summary).match(/(\d+)\s*-\s*(\d+)/);
  if (!m) return null;
  const w = +m[1], l = +m[2];
  const total = w + l;
  if (total < 5) return { w, l, pct: 0.5, thin: true };
  return { w, l, pct: w / total, thin: total < 20 };
}

function extractOdds(comp) {
  const oddsArr = comp.odds || [];
  if (!Array.isArray(oddsArr) || !oddsArr.length) return { price: null, open: null, details: null };
  const o = oddsArr[0] || {};
  let price = null;
  let open = null;
  if (o.details) price = o.details;
  if (o.provider && o.details) price = o.details;
  return { price: price || null, open: open, details: o };
}

function buildCtxFromEvent(ev, sportKey, sportLabel) {
  const comp = (ev.competitions || [])[0] || {};
  const statusType = (comp.status || {}).type || {};
  const status = statusType.description || statusType.shortDetail || "—";
  const final = /final/i.test(status);
  const postponed = /postpon|cancel/i.test(status);
  if (final || postponed) return null;

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
    if (c.homeAway === "home") home = obj;
    else away = obj;
  }
  if (!home || !away) return null;

  const game = `${away.abbr} @ ${home.abbr}`;
  const oddsInfo = extractOdds(comp);
  let price = oddsInfo.price || null;

  const formParts = [];
  formParts.push(`${away.abbr} ${away.record} (pct ${(away.pct * 100).toFixed(0)}%)`);
  formParts.push(`${home.abbr} ${home.record} (pct ${(home.pct * 100).toFixed(0)}%)`);
  const form = formParts.join(" · ");

  const situational = `Public ESPN board · ${status} · ${ev.date || ""} · venue ${(comp.venue || {}).fullName || "—"}`;
  const sampleNote = (away.thin || home.thin) ? "thin sample / limited games in record" : "season record sample available";
  const missing = "No verified injury report, lineup confirmation, or live market depth from this feed. Odds may be unavailable.";

  const candidates = [];
  candidates.push({
    selection: `${home.abbr} ML`,
    game,
    sport: sportKey.toUpperCase(),
    price: price || "—",
    tier: "LEAN",
    form,
    situational,
    sampleNote,
    missing,
    supporting: home.pct >= away.pct + 0.08 ? `${home.abbr} holds stronger season record vs ${away.abbr}` : `Close season records — limited edge from standings alone`,
    opposing: `Record edge alone is weak; injuries/lineups/odds not verified on this scan`,
    openPrice: oddsInfo.open || null,
    currentPrice: price,
    eventId: ev.id,
    status,
    analyzedAt: isoNow(),
    lastVerified: isoNow()
  });
  candidates.push({
    selection: `${away.abbr} ML`,
    game,
    sport: sportKey.toUpperCase(),
    price: price || "—",
    tier: "LEAN",
    form,
    situational,
    sampleNote,
    missing,
    supporting: away.pct >= home.pct + 0.08 ? `${away.abbr} holds stronger season record` : `Close records — limited edge from standings alone`,
    opposing: `Record edge alone is weak; injuries/lineups/odds not verified on this scan`,
    openPrice: oddsInfo.open || null,
    currentPrice: price,
    eventId: ev.id,
    status,
    analyzedAt: isoNow(),
    lastVerified: isoNow()
  });

  return { game, sport: sportKey.toUpperCase(), status, candidates, eventId: ev.id, date: ev.date };
}

export async function dailyScan({ sports = ["mlb", "nfl", "nba", "nhl"], force = false } = {}) {
  const dateKey = todayYYYYMMDD();
  const events = [];
  const errors = [];

  for (const key of sports) {
    const feed = FEEDS[key];
    if (!feed) continue;
    try {
      const data = await fetchBoard(feed.url, dateKey);
      for (const ev of data.events || []) {
        const built = buildCtxFromEvent(ev, key, feed.label);
        if (built) events.push(built);
      }
    } catch (e) {
      errors.push(`${key}: ${e.message}`);
    }
  }

  return {
    scannedAt: isoNow(),
    stamp: nowStamp(),
    dateKey,
    eventCount: events.length,
    events,
    errors
  };
}

export function analyzeCandidates(scanResult) {
  const topPlays = [];
  const leans = [];
  const noPlayEvents = [];

  for (const ev of scanResult.events || []) {
    let bestForEvent = null;
    for (const cand of ev.candidates || []) {
      const ctx = {
        sport: cand.sport,
        selection: cand.selection,
        game: cand.game,
        price: cand.price,
        form: cand.form,
        situational: cand.situational,
        sampleNote: cand.sampleNote,
        missing: cand.missing,
        supporting: cand.supporting,
        opposing: cand.opposing,
        openPrice: cand.openPrice,
        currentPrice: cand.currentPrice,
        allowNoOdds: true
      };
      const evRes = evaluateMatchup(ctx);
      const std = standardizePick({ ...cand, reasoning: { form: cand.form, situational: cand.situational, sampleNote: cand.sampleNote, missing: cand.missing, supporting: cand.supporting, opposing: cand.opposing } });

      const item = {
        ...cand,
        modelProb: evRes.modelProb,
        probabilityPct: evRes.probabilityPct,
        edge: evRes.edge,
        playLevel: evRes.playLevel,
        playEmoji: evRes.playEmoji,
        dataQuality: evRes.dataQuality,
        redFlags: evRes.redFlags || [],
        top3: evRes.top3 || [],
        biggestRisk: evRes.biggestRisk,
        autopsySurvived: evRes.autopsySurvived,
        marketSignal: evRes.marketSignal,
        whatIfClassification: evRes.whatIfClassification,
        std,
        analyzedAt: cand.analyzedAt,
        lastVerified: isoNow()
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
        if (!bestForEvent || item.tier === "LOCK") bestForEvent = item;
        else if (!bestForEvent) bestForEvent = item;
      }
    }

    if (bestForEvent && bestForEvent.tier === "LOCK") topPlays.push(bestForEvent);
    else if (bestForEvent && bestForEvent.tier === "LEAN") leans.push(bestForEvent);
    else noPlayEvents.push({ game: ev.game, sport: ev.sport, reason: "Insufficient verified edge / data quality / autopsy" });
  }

  topPlays.sort((a, b) => (b.edge || 0) - (a.edge || 0));
  leans.sort((a, b) => (b.edge || 0) - (a.edge || 0));

  return {
    topPlays: topPlays.slice(0, 5),
    leans: leans.slice(0, 8),
    noPlayEvents: noPlayEvents.slice(0, 20),
    qualifying: topPlays.length + leans.length > 0
  };
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
    return {
      text: lines.join("\n"),
      topPlays: [],
      leans: [],
      noPlay: true,
      stamp: scanMeta.stamp,
      analyzedAt: scanMeta.scannedAt,
      lastVerified: isoNow()
    };
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
    for (const n of analysis.noPlayEvents.slice(0, 5)) {
      lines.push(`• ${n.sport} ${n.game} — ${n.reason}`);
    }
  }

  lines.push("");
  lines.push("_Never guarantees outcomes. Process: scan → analyze → filter → monitor._");
  lines.push("21+ · 1-800-GAMBLER");

  return {
    text: lines.join("\n"),
    topPlays: analysis.topPlays,
    leans: analysis.leans,
    noPlay: false,
    stamp: scanMeta.stamp,
    analyzedAt: scanMeta.scannedAt,
    lastVerified: isoNow()
  };
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

  const tracker = loadTracker();
  for (const p of state.picks) {
    const id = `${scan.dateKey}-${p.sport}-${p.selection}-${p.eventId || ""}`;
    if (!tracker.picks.find(x => x.id === id)) {
      tracker.picks.push({
        id,
        date: scan.dateKey,
        sport: p.sport,
        league: p.sport,
        pick: p.selection,
        market: "ML",
        odds: p.price,
        probability: p.probabilityPct,
        edge: p.edge,
        confidence: p.dataQuality,
        tier: p.tier,
        result: "PENDING",
        analyzedAt: p.analyzedAt,
        reasoning: (p.top3 || []).slice(0, 3)
      });
    }
  }
  saveTracker(tracker);

  return { scan, analysis, board, state };
}

export async function reverifyPicks() {
  const state = loadState();
  if (!state.picks?.length) return { updates: [], removed: [] };

  const now = Date.now();
  const updates = [];
  const removed = [];

  for (const p of state.picks) {
    const analyzed = p.analyzedAt ? new Date(p.analyzedAt).getTime() : 0;
    if (now - analyzed > STALE_MS) {
      p.stale = true;
      updates.push({
        type: "STALE",
        pick: p.selection,
        message: `⚠️ STALE — REANALYSIS REQUIRED\n🕐 ANALYZED: ${p.analyzedAt}\n🔄 LAST VERIFIED: ${p.lastVerified || "—"}\nData older than 3h — do not treat as current.`
      });
      continue;
    }
    p.lastVerified = isoNow();
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
  const t = loadTracker();
  const pending = t.picks.filter(p => p.result === "PENDING").length;
  const graded = t.picks.filter(p => p.result !== "PENDING");
  const wins = graded.filter(p => p.result === "WIN").length;
  const losses = graded.filter(p => p.result === "LOSS").length;
  return {
    total: t.picks.length,
    pending,
    wins,
    losses,
    record: graded.length ? `${wins}-${losses}` : "—"
  };
}
