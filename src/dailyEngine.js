/**
 * DAILY SPORTS ANALYTICS ENGINE (v12 FULL CARD)
 * SCAN → ANALYZE → FILTER → VALIDATE → PUBLISH → MONITOR → AUTO-GRADE
 *
 * Full daily card: every live sport scanned, LOCKS + LEANS + WATCH with analysis.
 * Prefer NO PLAY over inventing confidence — but never hide analysis that exists.
 */
import { evaluateMatchup } from "./analyticsEngine.js";
import { ingestLivePicks, autoGradeFromFinals } from "./trackerCore.js";
import {
  FEEDS,
  liveFeedKeys,
  fetchEspnBoard,
  todayYYYYMMDD,
  isoNow,
  nowStamp
} from "./feeds.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = path.join(__dirname, "data", "dailyState.json");
const TRACKER_PATH = path.join(__dirname, "data", "tracker.json");

const MIN_EDGE_LOCK = 3.0;
const MIN_MODEL_LOCK = 0.56;
const STALE_MS = 3 * 60 * 60 * 1000;
const MODEL_VERSION = "analyticsEngine-v11.1";

// Full-card capacity (was 5 locks / 8 leans — too thin for a real desk)
const MAX_LOCKS = 12;
const MAX_LEANS = 24;
const MAX_WATCH = 20;

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
  return fetchEspnBoard(url, dates, 14000);
}

function parseRecord(summary) {
  if (!summary) return null;
  const m = String(summary).match(/(\d+)\s*-\s*(\d+)/);
  if (!m) return null;
  const w = +m[1],
    l = +m[2],
    total = w + l;
  if (total < 5) return { w, l, pct: 0.5, thin: true, total };
  return { w, l, pct: w / total, thin: total < 15, total };
}

function extractTeamOdds(oddsArr, homeAway) {
  if (!oddsArr?.length) return null;
  const o = oddsArr[0] || {};
  if (homeAway === "home" && o.homeTeamOdds?.moneyLine != null) {
    const n = Number(o.homeTeamOdds.moneyLine);
    return Number.isFinite(n) ? (n > 0 ? "+" + n : String(n)) : null;
  }
  if (homeAway === "away" && o.awayTeamOdds?.moneyLine != null) {
    const n = Number(o.awayTeamOdds.moneyLine);
    return Number.isFinite(n) ? (n > 0 ? "+" + n : String(n)) : null;
  }
  if (homeAway === "home" && o.homeOdds?.moneyLine != null) {
    const n = Number(o.homeOdds.moneyLine);
    return Number.isFinite(n) ? (n > 0 ? "+" + n : String(n)) : null;
  }
  if (homeAway === "away" && o.awayOdds?.moneyLine != null) {
    const n = Number(o.awayOdds.moneyLine);
    return Number.isFinite(n) ? (n > 0 ? "+" + n : String(n)) : null;
  }
  if (o.details && /^[+\-]?\d{3,4}$/.test(String(o.details).trim())) {
    return String(o.details).trim();
  }
  return null;
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
    const team = c.team || c.athlete || {};
    const abbr = team.abbreviation || team.shortDisplayName || team.displayName || "?";
    const record = parseRecord((c.records || [])[0]?.summary || c.record);
    const obj = {
      abbr,
      name: team.displayName || team.name || abbr,
      record,
      isHome: c.homeAway === "home",
      score: c.score != null ? Number(c.score) : null
    };
    if (c.homeAway === "home") home = obj;
    else away = obj;
  }
  if (!home || !away) return null;

  const oddsArr = comp.odds || ev.odds || [];
  const homeMl = extractTeamOdds(oddsArr, "home");
  const awayMl = extractTeamOdds(oddsArr, "away");

  const homePct = home.record?.pct ?? 0.5;
  const awayPct = away.record?.pct ?? 0.5;
  const recordGap = Math.abs(homePct - awayPct);

  const candidates = [];
  // Home side
  candidates.push({
    sport: sportKey,
    selection: home.abbr,
    game: `${away.abbr} @ ${home.abbr}`,
    price: homeMl,
    form: home.record
      ? `${home.record.w}-${home.record.l}${home.record.thin ? " (thin)" : ""}`
      : null,
    situational: status,
    sampleNote: home.record?.thin ? "thin sample" : null,
    missing: !homeMl ? ["odds"] : [],
    supporting: null,
    opposing: null,
    openPrice: homeMl,
    currentPrice: homeMl,
    recordGap,
    sidePct: homePct,
    isHome: true,
    eventId: ev.id,
    analyzedAt: isoNow(),
    _recordGap: recordGap,
    _sidePct: homePct
  });
  // Away side
  candidates.push({
    sport: sportKey,
    selection: away.abbr,
    game: `${away.abbr} @ ${home.abbr}`,
    price: awayMl,
    form: away.record
      ? `${away.record.w}-${away.record.l}${away.record.thin ? " (thin)" : ""}`
      : null,
    situational: status,
    sampleNote: away.record?.thin ? "thin sample" : null,
    missing: !awayMl ? ["odds"] : [],
    supporting: null,
    opposing: null,
    openPrice: awayMl,
    currentPrice: awayMl,
    recordGap,
    sidePct: awayPct,
    isHome: false,
    eventId: ev.id,
    analyzedAt: isoNow(),
    _recordGap: recordGap,
    _sidePct: awayPct
  });

  return {
    sport: sportKey,
    eventId: ev.id,
    game: `${away.abbr} @ ${home.abbr}`,
    status,
    candidates,
    home,
    away
  };
}

export async function dailyScan(opts = {}) {
  const dateKey = todayYYYYMMDD();
  const keys = liveFeedKeys();
  const events = [];
  const errors = [];
  const perSport = {};

  for (const key of keys) {
    const feed = FEEDS[key];
    if (!feed) continue;
    perSport[key] = { scanned: 0, error: null };
    try {
      const data = await fetchBoard(feed.url, dateKey);
      const list = data.events || [];
      perSport[key].scanned = list.length;
      for (const ev of list) {
        const ctx = buildCtxFromEvent(ev, feed.sport);
        if (ctx) events.push(ctx);
      }
    } catch (e) {
      errors.push(`${key}: ${e.message}`);
      perSport[key].error = e.message;
    }
  }
  return {
    scannedAt: isoNow(),
    stamp: nowStamp(),
    dateKey,
    eventCount: events.length,
    events,
    errors,
    perSport,
    sportsScanned: keys,
    modelVersion: MODEL_VERSION
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

function classifyItem(evRes) {
  // LOCK — strict
  if (
    evRes.playLevel === "STRONG PLAY" &&
    (evRes.edge == null || evRes.edge >= MIN_EDGE_LOCK) &&
    evRes.modelProb >= MIN_MODEL_LOCK &&
    evRes.autopsySurvived !== false &&
    (evRes.dataQuality === "High" || evRes.dataQuality === "Medium") &&
    !(evRes.redFlags || []).some((f) =>
      /injury|unknown lineup|thin sample/i.test(f)
    )
  ) {
    return "LOCK";
  }
  // LEAN — engine LEAN or solid STRONG that missed lock bar
  if (evRes.playLevel === "LEAN" || evRes.playLevel === "STRONG PLAY") {
    return "LEAN";
  }
  // WATCH — meaningful analysis but not a ticket yet (full card visibility)
  if (
    (evRes.modelProb != null && evRes.modelProb >= 0.52) ||
    (evRes.probabilityPct != null && evRes.probabilityPct >= 52)
  ) {
    return "WATCH";
  }
  return "NO PLAY";
}

export function analyzeCandidates(scanResult) {
  const topPlays = [];
  const leans = [];
  const watch = [];
  const noPlays = [];
  const bySport = {};

  for (const ev of scanResult.events || []) {
    const sport = (ev.sport || "UNK").toUpperCase();
    if (!bySport[sport]) {
      bySport[sport] = { events: 0, locks: [], leans: [], watch: [], noPlay: 0 };
    }
    bySport[sport].events++;

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
        recordGap: cand.recordGap ?? cand._recordGap,
        sidePct: cand.sidePct ?? cand._sidePct,
        isHome: cand.isHome
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
        createdAt: evRes.createdAt || cand.analyzedAt,
        modelVersion: MODEL_VERSION,
        predictionVersion: 1
      };

      const tier = classifyItem(evRes);
      item.tier = tier;
      if (tier === "LOCK") {
        item.playLevel = "STRONG PLAY";
      } else if (tier === "LEAN") {
        item.playLevel = "LEAN";
      } else if (tier === "WATCH") {
        item.playLevel = "WATCH";
      } else {
        item.playLevel = "NO PLAY";
      }

      if (tier !== "NO PLAY") {
        if (!bestForEvent || rankScore(item) > rankScore(bestForEvent)) {
          bestForEvent = item;
        }
      } else {
        noPlays.push(item);
        bySport[sport].noPlay++;
      }
    }

    if (bestForEvent) {
      if (bestForEvent.tier === "LOCK") {
        topPlays.push(bestForEvent);
        bySport[sport].locks.push(bestForEvent);
      } else if (bestForEvent.tier === "LEAN") {
        leans.push(bestForEvent);
        bySport[sport].leans.push(bestForEvent);
      } else if (bestForEvent.tier === "WATCH") {
        watch.push(bestForEvent);
        bySport[sport].watch.push(bestForEvent);
      }
    }
  }

  topPlays.sort((a, b) => rankScore(b) - rankScore(a));
  leans.sort((a, b) => rankScore(b) - rankScore(a));
  watch.sort((a, b) => rankScore(b) - rankScore(a));

  return {
    topPlays: topPlays.slice(0, MAX_LOCKS),
    leans: leans.slice(0, MAX_LEANS),
    watch: watch.slice(0, MAX_WATCH),
    noPlays: noPlays.slice(0, 15),
    bySport,
    forcedPlay: null,
    qualifying: topPlays.length + leans.length > 0,
    eventCount: (scanResult.events || []).length
  };
}

function formatPickLine(p, label) {
  const lines = [];
  lines.push(`**${label} · ${p.selection}** · ${p.game} · ${p.sport}`);
  lines.push(
    `Model **${p.probabilityPct != null ? p.probabilityPct + "%" : "—"}** · Odds **${p.price || "—"}** · Edge **${p.edge != null ? (p.edge >= 0 ? "+" : "") + p.edge + "%" : "n/a"}** · DQ **${p.dataQuality || "—"}`
  );
  if (p.top3?.length) {
    lines.push("Analysis: " + p.top3.slice(0, 3).map((r) => `• ${r}`).join(" "));
  }
  if (p.biggestRisk) lines.push(`Risk: ${p.biggestRisk}`);
  if (p.form) lines.push(`Form: ${String(p.form).slice(0, 120)}`);
  return lines.join("\n");
}

export function buildDailyBoard(analysis, scanMeta) {
  const locks = analysis.topPlays || [];
  const leans = analysis.leans || [];
  const watch = analysis.watch || [];
  const bySport = analysis.bySport || {};
  const sportsList = scanMeta.sportsScanned || Object.keys(bySport);

  const summary = [];
  summary.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  summary.push(`📡 FULL DAILY CARD · ${scanMeta.stamp || nowStamp()} CT`);
  summary.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  summary.push(
    `Scanned **${scanMeta.eventCount || 0}** events across **${(sportsList || []).length}** sports`
  );
  summary.push(
    `🔒 LOCKS: **${locks.length}** · ⭐ LEANS: **${leans.length}** · 👁 WATCH: **${watch.length}**`
  );
  if (scanMeta.errors?.length) {
    summary.push(`Feed notes: ${scanMeta.errors.slice(0, 4).join("; ")}`);
  }
  summary.push("");

  // Sport coverage map — always full card visibility
  summary.push("**SPORT COVERAGE**");
  for (const key of sportsList || []) {
    const sp = String(key).toUpperCase();
    const b = bySport[sp] || bySport[key] || {};
    const nEvents = b.events ?? scanMeta.perSport?.[key]?.scanned ?? 0;
    const err = scanMeta.perSport?.[key]?.error;
    if (err) {
      summary.push(`• ${sp}: feed error — ${err}`);
    } else {
      summary.push(
        `• ${sp}: ${nEvents} games · 🔒${(b.locks || []).length} · ⭐${(b.leans || []).length} · 👁${(b.watch || []).length}`
      );
    }
  }
  summary.push("");

  if (!analysis.qualifying && !watch.length) {
    summary.push("**BOARD STATUS**");
    if ((scanMeta.eventCount || 0) === 0) {
      summary.push("No live games on ESPN boards right now.");
      summary.push("Card will fill when events appear and evidence supports a side.");
    } else {
      summary.push("No LOCK/LEAN cleared the evidence bar after full multi-sport analysis.");
      summary.push("Silence preferred over inventing confidence.");
    }
    summary.push("");
    summary.push(`🕐 CREATED: ${scanMeta.scannedAt || isoNow()}`);
    summary.push(`🔄 LAST VERIFIED: ${nowStamp()}`);
    summary.push(`📡 DATA: ESPN public · model ${MODEL_VERSION}`);
    summary.push("");
    summary.push("_Not a guarantee of outcomes. 21+ · 1-800-GAMBLER_");
    return {
      text: summary.join("\n"),
      topPlays: [],
      leans: [],
      watch: [],
      bySport,
      noPlay: true,
      emptyBoard: (scanMeta.eventCount || 0) === 0,
      stamp: scanMeta.stamp,
      analyzedAt: scanMeta.scannedAt,
      lastVerified: isoNow(),
      modelVersion: MODEL_VERSION,
      sections: { summary: summary.join("\n"), locks: "", leans: "", watch: "" }
    };
  }

  // LOCKS section
  const lockLines = [];
  if (locks.length) {
    lockLines.push("🔥 **TOP PLAYS / LOCKS**");
    for (const p of locks) {
      lockLines.push("");
      lockLines.push(formatPickLine(p, "🔒 LOCK"));
    }
  } else {
    lockLines.push("🔥 **TOP PLAYS / LOCKS**");
    lockLines.push("No verified LOCK today — strict bar held.");
  }

  // LEANS section
  const leanLines = [];
  if (leans.length) {
    leanLines.push("⭐ **LEANS · FULL CARD**");
    for (const p of leans) {
      leanLines.push("");
      leanLines.push(formatPickLine(p, "⭐ LEAN"));
    }
  } else {
    leanLines.push("⭐ **LEANS**");
    leanLines.push("No verified LEAN after analysis.");
  }

  // WATCH section — full analysis visibility
  const watchLines = [];
  if (watch.length) {
    watchLines.push("👁 **WATCH · ANALYZED (not tickets)**");
    watchLines.push("_Near the bar — tracked for updates, not published as plays._");
    for (const p of watch.slice(0, 12)) {
      watchLines.push("");
      watchLines.push(formatPickLine(p, "👁 WATCH"));
    }
  }

  const footer = [
    "",
    `🕐 CREATED: ${scanMeta.scannedAt || isoNow()}`,
    `🔄 LAST VERIFIED: ${nowStamp()}`,
    `📡 DATA: ESPN public · model ${MODEL_VERSION}`,
    "",
    "_Full card · evidence-first · NO PLAY preferred over inventing confidence · 21+ · 1-800-GAMBLER_"
  ];

  const text = [
    summary.join("\n"),
    lockLines.join("\n"),
    "",
    leanLines.join("\n"),
    watchLines.length ? "\n" + watchLines.join("\n") : "",
    footer.join("\n")
  ]
    .filter(Boolean)
    .join("\n");

  return {
    text,
    topPlays: locks,
    leans,
    watch,
    bySport,
    noPlay: locks.length + leans.length === 0,
    emptyBoard: false,
    stamp: scanMeta.stamp,
    analyzedAt: scanMeta.scannedAt,
    lastVerified: isoNow(),
    modelVersion: MODEL_VERSION,
    sections: {
      summary: summary.join("\n"),
      locks: lockLines.join("\n"),
      leans: leanLines.join("\n"),
      watch: watchLines.join("\n")
    }
  };
}

/** Split board into Discord-safe embed payloads (max ~3900 chars each) */
export function boardToEmbedPayloads(board) {
  const payloads = [];
  const waiting = !!board?.emptyBoard || !!board?.noPlay;
  const color = waiting ? 0x95a5a6 : 0x2ecc71;
  const sections = board?.sections || {};
  const chunks = [];

  if (sections.summary) chunks.push({ title: "📡 FULL DAILY CARD", body: sections.summary });
  if (sections.locks) chunks.push({ title: "🔒 LOCKS", body: sections.locks });
  if (sections.leans) chunks.push({ title: "⭐ LEANS", body: sections.leans });
  if (sections.watch) chunks.push({ title: "👁 WATCH", body: sections.watch });

  if (!chunks.length) {
    chunks.push({
      title: waiting ? "📡 BOARD · NO VERIFIED / WAITING" : "📡 DAILY BOARD",
      body: (board?.text || "No board.").slice(0, 3900)
    });
  }

  for (const ch of chunks) {
    // Split oversized sections
    let body = ch.body || "";
    while (body.length > 0) {
      const slice = body.slice(0, 3900);
      body = body.slice(3900);
      payloads.push({
        color,
        title: ch.title,
        description: slice,
        footer: "EDGE PLAY · full daily card · evidence-first · 21+"
      });
    }
  }
  return payloads;
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
      reasoning: p.top3 || [],
      modelVersion: MODEL_VERSION,
      predictionVersion: 1,
      analyzedAt: p.analyzedAt,
      lastVerified: p.lastVerified
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
          message: `🔄 AUTO RESCAN — 🔒${(board?.topPlays || []).length} · ⭐${(board?.leans || []).length} · 👁${(board?.watch || []).length}`
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
