import { buildEvidenceAnalysis, stressTestPick } from "./analyticsEngine.js";
/**
 * Daily auto card — builds NEW picks every calendar day (CT)
 * + live scan from ESPN public boards.
 * ALWAYS exports: rollDailyCard, ensureTodayCard, getDailyCard, getLastBoard
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fetchMultiScores } from "./liveScores.js";
import * as desk from "./data/desk.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE = path.join(__dirname, "data", "dailyCard.json");

let lastBoard = null;

function ctNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
}
function dateKey(d = ctNow()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function dateLabel() {
  return ctNow().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Chicago" });
}
function loadDaily() {
  try {
    if (fs.existsSync(STORE)) return JSON.parse(fs.readFileSync(STORE, "utf8"));
  } catch {}
  return null;
}
function saveDaily(card) {
  try {
    fs.mkdirSync(path.dirname(STORE), { recursive: true });
    fs.writeFileSync(STORE, JSON.stringify(card, null, 2));
  } catch (e) {
    console.warn("saveDaily", e.message);
  }
}
function parseEspnLine(line, sport) {
  const m = line.match(/\*\*([^*]+)\*\*/);
  const game = m ? m[1].trim() : line.slice(0, 60);
  const status = line.split("·").slice(-1)[0]?.trim() || "";
  const live = /in progress|q\d|half|period|inning|live/i.test(status);
  const final = /final/i.test(status);
  return { sport: sport.toUpperCase(), game, status, live, final, raw: line };
}
function teamsFromGame(game) {
  const core = (game || "").split("·")[0].trim();
  const m = core.match(/^(.+?)\s+@\s+(.+)$/);
  if (m) return { away: m[1].trim(), home: m[2].trim(), label: m[1].trim() + " @ " + m[2].trim() };
  return { away: null, home: core, label: core };
}
function buildAnalysis(o = {}) {
  return {
    form: o.form || "—",
    situational: o.situational || "—",
    number: o.number || "—",
    media: o.media || "IG/X/TG signal only",
    kill: o.kill || "Injury · line move · missing starter",
    decision: o.decision || "—",
    facts: o.facts || "ESPN board when available",
    projection: o.projection || "Process lean — not guaranteed",
    missing: o.missing || "Injuries / closing line may move",
    confidence: o.confidence || "MEDIUM",
    bothSides: o.bothSides || "Other side if price wrong",
    prediction: o.decision || o.prediction || "—",
    serve: o.number || o.serve || "—"
  };
}
function forceCategoryLocks(picks) {
  if (!picks?.length) return picks;
  const bySport = {};
  for (const p of picks) {
    if (p.final || /Postponed|OFF|FINAL/i.test(p.game || "")) continue;
    const s = (p.sport || "OTHER").toUpperCase();
    if (!bySport[s]) bySport[s] = [];
    bySport[s].push(p);
  }
  for (const [sport, list] of Object.entries(bySport)) {
    let top =
      list.find((p) => p.tier === "LOCK" || p.potd) ||
      list.find((p) => p.tier === "VALUE") ||
      list.find((p) => p.tier === "LEAN") ||
      list[0];
    if (!top) continue;
    for (const p of list) {
      if (p === top) continue;
      if (p.tier === "LOCK" && !p.potd) {
        p.tier = "VALUE";
        p.units = Math.min(p.units || 0.35, 0.35);
      }
    }
    if (top.tier !== "LOCK") {
      top.tier = "LOCK";
      top.units = Math.max(top.units || 0.5, 0.5);
      top.why = `🔒 CATEGORY LOCK · ${sport} · ✅ TAKE **${top.selection}**`;
      if (!top.reasoning) top.reasoning = {};
      top.reasoning.decision = `🔒 ✅ TAKE **${top.selection}** · category lock for ${sport}`;
      top.confidenceLabel = "LOW CONFIDENCE";
    }
  }
  return picks;
}
function forcePromoteFromMediaStats(picks) {
  if (!picks?.length) return picks;
  const score = (p) => {
    let s = 0;
    if (p.potd) s += 50;
    if (p.tier === "LOCK") s += 40;
    if (p.tier === "VALUE") s += 30;
    if (p.tier === "LEAN") s += 20;
    if (p.final) s -= 100;
    if (/Postponed|Delayed/i.test(p.game || "")) s -= 80;
    return s;
  };
  const ranked = [...picks]
    .filter((p) => !p.final && !/Postponed|Delayed/i.test(p.game || ""))
    .sort((a, b) => score(b) - score(a));
  const top = ranked.find((p) => score(p) > 0) || ranked[0];
  if (!top) return picks;
  top.tier = "LOCK";
  top.potd = true;
  top.units = Math.max(top.units || 0.25, 0.5);
  top.why = `🔒 LOCK OF THE DAY · ✅ TAKE ${top.selection}`;
  top.reasoning = buildAnalysis({
    form: (top.reasoning && top.reasoning.form) || "Ranked #1 on daily ESPN slate",
    situational: (top.reasoning && top.reasoning.situational) || top.game,
    number: top.price,
    decision: "🔒 ✅ TAKE " + top.selection + " · " + top.units + "u",
    confidence: "MEDIUM"
  });
  return picks;
}
function processPickFromGame(g) {
  const teams = teamsFromGame(g.game);
  const home = teams.home || "HOME";
  const away = teams.away || "AWAY";
  const label = teams.label || g.game;
  const statusBit = g.status ? " · " + g.status : "";
  if (g.final || /Postponed|Delayed|Cancel/i.test((g.status || "") + (g.game || ""))) {
    return {
      sport: g.sport, tier: "PASS", game: label + statusBit,
      selection: home + " / " + away + (g.final ? " — FINAL" : " — OFF"),
      price: "—", units: 0, why: "🚫 PASS · no ticket",
      type: "ml", kalshi: true, live: false, final: !!g.final
    };
  }
  const selection = home + " ML";
  const tier = g.sport === "MLB" ? "VALUE" : "LEAN";
  const units = g.sport === "MLB" ? 0.35 : 0.25;
  return {
    sport: g.sport, tier, game: label + statusBit, selection,
    price: "52¢ process mid",
    units,
    why: (tier === "VALUE" ? "💎" : "➖") + " ✅ TAKE **" + selection + "** · " + label,
    reasoning: buildAnalysis({
      form: "Named ESPN game: " + label,
      situational: "Home " + home + " vs " + away,
      number: "TAKE " + selection + " in process band",
      decision: "✅ TAKE **" + selection + "** · " + units + "u",
      kill: "Injury · bad mid · postponement",
      confidence: "MEDIUM"
    }),
    type: "ml", kalshi: true, live: g.live, final: false
  };
}
function buildDefaultLotd(key, picks) {
  const ranked =
    picks.find((p) => p.potd && !p.final) ||
    picks.find((p) => p.tier === "LOCK" && !p.final) ||
    picks.find((p) => p.tier === "VALUE" && !p.final) ||
    picks[0];
  if (!ranked) {
    return {
      date: key, sport: "DESK", event: "Daily", match: "Awaiting slate",
      pick: "Run /daily when games post", market: "—", priceGuide: "—", units: 0,
      tier: "LOCK OF THE DAY",
      analysis: buildAnalysis({ decision: "Re-run /daily", confidence: "LOW" })
    };
  }
  const r = ranked.reasoning || {};
  return {
    date: key, sport: ranked.sport, event: ranked.sport + " · desk",
    match: ranked.game,
    pick: "👑 LOCK OF THE DAY · " + ranked.selection,
    market: ranked.type || "ml", priceGuide: ranked.price,
    units: Math.max(ranked.units || 0.5, 0.5),
    tier: "LOCK OF THE DAY",
    analysis: buildAnalysis({
      form: r.form || ranked.why,
      situational: r.situational || ranked.game,
      number: r.number || ranked.price,
      decision: r.decision || ("✅ TAKE " + ranked.selection),
      kill: r.kill || "Injury · bad number",
      confidence: "MEDIUM"
    })
  };
}
function applyToDesk(card) {
  try {
    if (card.lockOfTheDay) Object.assign(desk.lockOfTheDay, card.lockOfTheDay);
    if (card.picks && desk.liveCard) {
      desk.liveCard.picks = card.picks;
      desk.liveCard.dateLabel = card.dateLabel;
      desk.liveCard.updated = card.updated;
    }
  } catch (e) {
    console.warn("applyToDesk", e.message);
  }
}
function refreshLiveFlags(card) {
  return card;
}

export async function rollDailyCard({ force = false } = {}) {
  const key = dateKey();
  const existing = loadDaily();
  if (!force && existing?.dateKey === key && existing?.picks?.length) {
    lastBoard = existing;
    return refreshLiveFlags(existing);
  }
  let boards = [];
  try {
    boards = await fetchMultiScores(["mlb", "nfl", "nba"]);
  } catch (e) {
    console.error("dailyRoll ESPN:", e.message);
  }
  const games = [];
  for (const b of boards) {
    for (const line of b.lines || []) {
      games.push(parseEspnLine(line, b.sport));
    }
  }
  let picks = games.map(processPickFromGame);
  picks = forcePromoteFromMediaStats(picks);
  picks = forceCategoryLocks(picks);
  const lockOfDay = buildDefaultLotd(key, picks);
  const card = {
    dateKey: key,
    dateLabel: dateLabel() + " · AUTO DAILY CARD",
    updated: new Date().toISOString(),
    note: "Auto-rolled from ESPN. One LOCK per category when games exist.",
    picks,
    lockOfTheDay: lockOfDay,
    source: "espn+process",
    text: picks.slice(0, 8).map((p) => `${p.tier} ${p.selection} · ${p.game}`).join("\n")
  };
  saveDaily(card);
  applyToDesk(card);
  lastBoard = card;
  console.log(`Daily card ${key}: ${picks.length} picks · POTD ${(lockOfDay.pick || "").slice(0, 50)}`);
  return card;
}

export function getDailyCard() {
  const c = loadDaily();
  if (c?.dateKey === dateKey()) return c;
  return null;
}

/** Required by announce.js and other modules */
export function getLastBoard() {
  return lastBoard || getDailyCard() || loadDaily();
}

export async function ensureTodayCard() {
  const c = getDailyCard();
  const needsNames =
    !c?.picks?.length ||
    c.picks.every((p) =>
      /process|Confirmed SP|Soft-side|Lineup-confirmed|Wait SP|Board scan/i.test(p.selection || "")
    );
  if (needsNames) return rollDailyCard({ force: true });
  lastBoard = c;
  return refreshLiveFlags(c);
}
