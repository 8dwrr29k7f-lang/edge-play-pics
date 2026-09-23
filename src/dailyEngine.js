/**
 * DAILY SPORTS ANALYTICS ENGINE (v10 PRODUCTION)
 * SCAN → ANALYZE → FILTER → VALIDATE → PUBLISH → MONITOR → AUTO-GRADE → LEARN
 *
 * POLICY:
 * - Publish LOCK only when evidence is strong
 * - Publish LEAN when evidence is adequate
 * - Prefer NO PLAY / empty board over inventing confidence
 * - Never fabricate odds, injuries, lineups, or results
 * - Auto-detect wins/losses from ESPN finals when possible
 */
import { evaluateMatchup } from "./analyticsEngine.js";
import { ingestLivePicks, autoGradeFromFinals } from "./trackerCore.js";
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
const MIN_EDGE_LEAN = 1.0;
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

async function fetchBoard(url, dates) {
  let u = url;
  if (dates) u += (u.includes("?") ? "&" : "?") + "dates=" + dates;
  const res = await fetch(u, {
    signal: AbortSignal.timeout(12000),
    headers: { "User-Agent": "EDGE-PLAY-PICS/4.4" }
  });
  if (!res.ok) throw new Error("ESPN " + res.status);
  return res.json();
}

function todayYYYYMMDD() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
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

function parseRecord(summary) {
  if (!summary) return null;
  const m = String(summary).match(/(\d+)\s*-\s*(\d+)/);
  if (!m) return null;
  const w = +m[1],
    l = +m[2],
    total = w + l;
  if (total < 5) return { w, l, pct: 0.5, thin: true };
  return { w, l, pct: w / total, thin: total < 20 };
}

function buildCtxFromEvent(ev, sportKey) {
  const comp = (ev.competitions || [])[0] || {};
  const statusType = (comp.status || {}).type || {};
  const status = statusType.description || statusType.shortDetail || "—";
  if (/final|postpon|cancel/i.test(status)) return null;
  const competitors = comp.competitors || [];
  let home = null,
    away = null;
  for (const c of competitors) {
    const team = c.team || {};
    const rec =
      (c.records || []).find((r) => r.type === "total" || r.name === "overall") ||
      (c.records || [])[0];
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
  const oddsArr = comp.odds || [];
  const price = oddsArr[0]?.details || null;
  const form = `${away.abbr} ${away.record} (pct ${(away.pct * 100).toFixed(0)}%) · ${home.abbr} ${home.record} (pct ${(home.pct * 100).toFixed(0)}%)`;
  const situational = `Public ESPN board · ${status} · ${ev.date || ""} · venue ${(comp.venue || {}).fullName || "—"}`;
  const sampleNote =
    away.thin || home.thin
      ? "thin sample / limited games in record"
      : "season record sample available";
  const missing =
    "No verified injury report, lineup confirmation, or live market depth from this feed. Odds may be unavailable.";
  const mk = (side, other) => ({
    selection: `${side.abbr} ML`,
    game,
    sport: sportKey.toUpperCase(),
    price: price || "—",
    tier: "LEAN",
    form,
    situational,
    sampleNote,
    missing,
    supporting:
      side.pct >= other.pct + 0.08
        ? `${side.abbr} holds stronger season record vs ${other.abbr}`
        : `Close season records — limited edge from standings alone`,
    opposing:
      "Record edge alone is weak; injuries/lineups/odds not verified on this scan",
    openPrice: null,
    currentPrice: price,
    eventId: ev.id,
    status,
    analyzedAt: isoNow(),
    lastVerified: isoNow(),
    _sidePct: side.pct,
    _otherPct: other.pct,
    _recordGap: side.pct - other.pct
  });
  return {
    game,
    sport: sportKey.toUpperCase(),
    status,
    candidates: [mk(home, away), mk(away, home)],
    eventId: ev.id,
    date: ev.date
  };
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
  return {
    scannedAt: isoNow(),
    stamp: nowStamp(),
    dateKey,
    eventCount: events.length,
    events,
    errors
  };
}

function rankScore(item) {
  const model = item.modelProb != null ? item.modelProb : 0.5;
  const edge = item.edge != null ? item.edge : 0;
  const gap = item._recordGap != null ? item._recordGap : 0;
  const dq =
    item.dataQuality === "High" ? 0.03 : item.dataQuality === "Medium" ? 0.015 : 0;
  return model * 100 + edge + gap * 20 + dq * 100;
}

export function analyzeCandidates(scanResult) {
  const topPlays = [];
  const leans = [];
  const noPlays = [];

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
        currentPrice: cand.currentPrice
      };
      const evRes = evaluateMatchup(ctx);
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
        dataStatus: evRes.dataStatus,
        analyzedAt: cand.analyzedAt,
        lastVerified: isoNow(),
        createdAt: evRes.createdAt || cand.analyzedAt
      };

      if (evRes.playLevel === "STRONG PLAY") {
        const isLock =
          (evRes.edge == null || evRes.edge >= MIN_EDGE_LOCK) &&
          evRes.modelProb >= MIN_MODEL_LOCK &&
          evRes.autopsySurvived !== false &&
          (evRes.dataQuality === "High" || evRes.dataQuality === "Medium") &&
          !(evRes.redFlags || []).some((f) =>
            /injury|unknown lineup|missing odds|thin sample/i.test(f)
          );
        if (isLock) {
          item.tier = "LOCK";
          item.playLevel = "STRONG PLAY";
          item.forced = false;
        } else {
          item.tier = "LEAN";
          item.playLevel = "LEAN";
          item.forced = false;
        }
      } else if (evRes.playLevel === "LEAN") {
        item.tier = "LEAN";
        item.forced = false;
      } else {
        item.tier = "NO PLAY";
        item.playLevel = "NO PLAY";
        item.forced = false;
      }

      if (item.playLevel !== "NO PLAY") {
        if (!bestForEvent || rankScore(item) > rankScore(bestForEvent)) {
          bestForEvent = item;
        }
      } else {
        noPlays.push(item);
      }
    }
    if (bestForEvent) {
      if (bestForEvent.tier === "LOCK") topPlays.push(bestForEvent);
      else leans.push(bestForEvent);
    }
  }

  topPlays.sort((a, b) => rankScore(b) - rankScore(a));
  leans.sort((a, b) => rankScore(b) - rankScore(a));

  return {
    topPlays: topPlays.slice(0, 5),
    leans: leans.slice(0, 8),
    noPlays: noPlays.slice(0, 10),
    forcedPlay: null,
    qualifying: topPlays.length + leans.length > 0,
    eventCount: (scanResult.events || []).length
  };
}

export function buildDailyBoard(analysis, scanMeta) {
  const lines = [];
  lines.push("━━━━━━━━━━━━━━━━━━");
  lines.push(`📡 DAILY BOARD · ${scanMeta.stamp || nowStamp()} CT`);
  lines.push("━━━━━━━━━━━━━━━━━━");
  lines.push(
    `Scanned ${scanMeta.eventCount || 0} events · Evidence-first (NO PLAY when data is thin)`
  );
  lines.push("");

  if (!analysis.qualifying) {
    lines.push("📡 BOARD STATUS");
    if ((scanMeta.eventCount || 0) === 0) {
      lines.push("No live games on the ESPN boards right now.");
      lines.push("Bot will publish when events appear and evidence supports a side.");
    } else {
      lines.push("🚫 NO PLAY — insufficient verified evidence for a supported selection.");
      lines.push("Games exist, but injuries/lineups/odds/sample quality do not clear the bar.");
      lines.push("A lack of a pick is preferable to inventing confidence.");
    }
    lines.push("Run `/scan` after more information is confirmed.");
    lines.push("");
    lines.push("🕐 CREATED: " + (scanMeta.scannedAt || isoNow()));
    lines.push("🔄 LAST VERIFIED: " + nowStamp());
    lines.push("📡 DATA STATUS: ESPN public scoreboard only");
    lines.push("");
    lines.push("_Not a guarantee of outcomes. 21+ · 1-800-GAMBLER_");
    return {
      text: lines.join("\n"),
      topPlays: [],
      leans: [],
      noPlay: true,
      emptyBoard: true,
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
      lines.push(`🏟️ GAME: ${p.game} · ${p.sport}`);
      lines.push(`📊 MODEL PROBABILITY: ${p.probabilityPct != null ? p.probabilityPct + "%" : "—"}`);
      lines.push(`💰 ODDS: ${p.price || "—"}`);
      lines.push(`📈 EDGE: ${p.edge != null ? (p.edge >= 0 ? "+" : "") + p.edge + "%" : "n/a"}`);
      lines.push(
        `⚠️ RISK: ${p.redFlags?.length ? "HIGH" : p.dataQuality === "High" ? "MEDIUM" : "HIGH"}`
      );
      lines.push(`📡 DATA QUALITY: ${p.dataQuality || "LOW"}`);
      lines.push(`📡 DATA STATUS: ${p.dataStatus || "ESPN snapshot"}`);
      lines.push("");
      lines.push("🔥 WHY IT'S SUPPORTED:");
      for (const r of (p.top3 || []).slice(0, 3)) lines.push(`• ${r}`);
      lines.push("");
      lines.push(`🚨 BIGGEST RISK: ${p.biggestRisk || "Unverified injuries / lineups / market depth"}`);
      lines.push(
        `🕐 CREATED: ${p.analyzedAt ? new Date(p.analyzedAt).toLocaleString("en-US", { timeZone: "America/Chicago" }) : "—"}`
      );
      lines.push(`🔄 LAST VERIFIED: ${nowStamp()}`);
    }
  }

  if (analysis.leans.length) {
    lines.push("");
    lines.push("⭐ LEANS");
    for (const p of analysis.leans) {
      lines.push("");
      lines.push("━━━━━━━━━━━━━━━━━━");
      lines.push("⭐ DAILY LEAN");
      lines.push("━━━━━━━━━━━━━━━━━━");
      lines.push(`🎯 PICK: ${p.selection}`);
      lines.push(`🏟️ GAME: ${p.game} · ${p.sport}`);
      lines.push(`📊 MODEL PROBABILITY: ${p.probabilityPct != null ? p.probabilityPct + "%" : "—"}`);
      lines.push(`💰 ODDS: ${p.price || "—"}`);
      lines.push(`📈 EDGE: ${p.edge != null ? (p.edge >= 0 ? "+" : "") + p.edge + "%" : "n/a"}`);
      lines.push(`⚠️ RISK: MEDIUM–HIGH`);
      lines.push(`📡 DATA QUALITY: ${p.dataQuality || "LOW"}`);
      lines.push(`📡 DATA STATUS: ${p.dataStatus || "ESPN snapshot"}`);
      if (p.top3?.length) {
        lines.push("🔥 WHY:");
        for (const r of p.top3.slice(0, 2)) lines.push(`• ${r}`);
      }
      lines.push(`🚨 BIGGEST RISK: ${p.biggestRisk || "Thin evidence"}`);
      lines.push(`🔄 LAST VERIFIED: ${nowStamp()}`);
    }
  }

  lines.push("");
  lines.push("_Evidence-first process. NO PLAY preferred over inventing confidence. Not a guarantee of outcomes._");
  lines.push("21+ · 1-800-GAMBLER");

  return {
    text: lines.join("\n"),
    topPlays: analysis.topPlays,
    leans: analysis.leans,
    noPlay: false,
    emptyBoard: false,
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
  try {
    const toIngest = (state.picks || []).map((p) => ({
      id: `${scan.dateKey}-${p.sport}-${p.selection}-${p.eventId || ""}`,
      date: scan.dateKey,
      sport: p.sport,
      selection: p.selection,
      market: "ml",
      odds: typeof p.price === "number" ? p.price : 0,
      units: p.tier === "LOCK" ? 1 : 0.5,
      tier: p.tier,
      game: p.game,
      eventId: p.eventId,
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
  if (!state.picks?.length) {
    // Still try auto-grade even with empty board
    try {
      await autoGradePending();
    } catch (e) {
      console.warn("autoGrade:", e.message);
    }
    return { updates: [], removed: [] };
  }
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
        message: [
          "⚠️ STALE — REANALYSIS REQUIRED",
          `🎯 PICK: ${p.selection}`,
          `🕐 ANALYZED: ${p.analyzedAt || "—"}`,
          `🔄 LAST VERIFIED: ${p.lastVerified || "—"}`,
          "Data older than 3h — board will auto-refresh."
        ].join("\n")
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
          message: `🔄 AUTO RESCAN complete — ${(board?.topPlays || []).length} LOCK / ${(board?.leans || []).length} LEAN · empty=${!!board?.emptyBoard}`
        });
        try {
          await autoGradePending();
        } catch (e) {
          console.warn("autoGrade after rescan:", e.message);
        }
        return { updates, removed, state: newState };
      } catch (e) {
        console.warn("auto rescan failed:", e.message);
        updates.push({
          type: "RESCAN_FAIL",
          pick: "BOARD",
          message: "🔄 Auto rescan failed: " + e.message
        });
      }
    }
  }
  state.lastVerify = isoNow();
  saveState(state);
  try {
    const graded = await autoGradePending();
    if (graded?.length) {
      for (const g of graded) {
        updates.push({
          type: "AUTO_GRADE",
          pick: g.selection,
          message: `✅ AUTO-GRADED ${g.selection} → **${g.result.toUpperCase()}** · PL ${g.pl >= 0 ? "+" : ""}${Number(g.pl).toFixed(2)}u`
        });
      }
    }
  } catch (e) {
    console.warn("autoGrade:", e.message);
  }
  return { updates, removed, state };
}

/** Fetch finals from ESPN and auto-grade pending ML picks */
export async function autoGradePending() {
  const finals = [];
  for (const key of Object.keys(FEEDS)) {
    try {
      const data = await fetchBoard(FEEDS[key].url, todayYYYYMMDD());
      for (const ev of data.events || []) {
        const comp = (ev.competitions || [])[0] || {};
        const statusType = (comp.status || {}).type || {};
        const status = statusType.description || statusType.shortDetail || "";
        if (!/final/i.test(status)) continue;
        const competitors = comp.competitors || [];
        let home = null,
          away = null;
        for (const c of competitors) {
          const team = c.team || {};
          const abbr = team.abbreviation || team.shortDisplayName || "?";
          const score = c.score != null ? Number(c.score) : null;
          const winner = !!c.winner;
          const obj = { abbr, score, winner };
          if (c.homeAway === "home") home = obj;
          else away = obj;
        }
        if (!home || !away) continue;
        finals.push({
          sport: FEEDS[key].sport,
          game: `${away.abbr} @ ${home.abbr}`,
          home,
          away,
          eventId: ev.id
        });
      }
    } catch (e) {
      console.warn("autoGrade feed", key, e.message);
    }
  }
  if (!finals.length) return [];
  return autoGradeFromFinals(finals);
}

export function getCurrentBoard() {
  const state = loadState();
  if (!state.board) return null;
  const verified = state.lastVerify ? new Date(state.lastVerify).getTime() : 0;
  if (Date.now() - verified > STALE_MS) {
    return {
      ...state.board,
      stale: true,
      text: (state.board.text || "") + "\n\n⚠️ STALE — REANALYSIS REQUIRED"
    };
  }
  return state.board;
}

export function getTrackerSummary() {
  try {
    if (fs.existsSync(TRACKER_PATH)) {
      const t = JSON.parse(fs.readFileSync(TRACKER_PATH, "utf8"));
      const picks = t.picks || [];
      const norm = (r) => String(r || "pending").toLowerCase();
      const pending = picks.filter((p) => norm(p.result) === "pending").length;
      const graded = picks.filter((p) => ["win", "loss", "push"].includes(norm(p.result)));
      const wins = graded.filter((p) => norm(p.result) === "win").length;
      const losses = graded.filter((p) => norm(p.result) === "loss").length;
      return {
        total: picks.length,
        pending,
        wins,
        losses,
        record: graded.length ? `${wins}-${losses}` : "—"
      };
    }
  } catch {}
  return { total: 0, pending: 0, wins: 0, losses: 0, record: "—" };
}
