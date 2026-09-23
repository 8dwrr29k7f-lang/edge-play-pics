/**
 * Category pipeline — never silently skip a category.
 *
 * For each category:
 * 1. Resolve registry entry
 * 2. Fetch live data (if feed exists)
 * 3. Run evaluateMatchup on each candidate
 * 4. Return LOCK / LEAN / NO VERIFIED PICK with explicit reason
 *
 * Static fake picks are forbidden.
 */

import { evaluateMatchup } from "./analyticsEngine.js";
import { getCategory, liveCategoryKeys, CATEGORY_REGISTRY } from "./categoryRegistry.js";
import { ingestLivePicks } from "./trackerCore.js";

const FEEDS = {
  mlb: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard",
  nfl: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
  nba: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",
  nhl: "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard",
  ncaaf: "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard",
  soccer: "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard",
  tennis: "https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard",
  kbo: "https://site.api.espn.com/apis/site/v2/sports/baseball/kbo/scoreboard"
};

function isoNow() {
  return new Date().toISOString();
}

function nowStamp() {
  return new Date().toLocaleString("en-US", { timeZone: "America/Chicago", hour12: true });
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

async function fetchEspn(url, dates) {
  let u = url;
  if (dates) u += (u.includes("?") ? "&" : "?") + "dates=" + dates;
  const res = await fetch(u, {
    signal: AbortSignal.timeout(12000),
    headers: { "User-Agent": "EDGE-PLAY-PICS/4.4-category" }
  });
  if (!res.ok) throw new Error(`ESPN HTTP ${res.status}`);
  return res.json();
}

function buildCandidates(ev, sportKey) {
  const comp = (ev.competitions || [])[0] || {};
  const statusType = (comp.status || {}).type || {};
  const status = statusType.description || statusType.shortDetail || "—";
  if (/final|postpon|cancel/i.test(status)) return null;

  const competitors = comp.competitors || [];
  // Tennis / multi-player: treat as two competitors when present
  let home = null,
    away = null;
  for (const c of competitors) {
    const team = c.team || c.athlete || {};
    const rec =
      (c.records || []).find((r) => r.type === "total" || r.name === "overall") ||
      (c.records || [])[0];
    const parsed = parseRecord(rec?.summary);
    const obj = {
      abbr: team.abbreviation || team.shortDisplayName || team.displayName || "?",
      name: team.displayName || team.name || "?",
      record: rec?.summary || "—",
      pct: parsed?.pct ?? 0.5,
      thin: parsed?.thin ?? true,
      homeAway: c.homeAway || (home ? "away" : "home")
    };
    if (c.homeAway === "home" || (!home && competitors.indexOf(c) === 0)) home = obj;
    else away = obj;
  }
  // Fallback: first two competitors
  if (!home && competitors[0]) {
    const t = competitors[0].team || competitors[0].athlete || {};
    home = {
      abbr: t.abbreviation || t.shortDisplayName || t.displayName || "A",
      name: t.displayName || "A",
      record: "—",
      pct: 0.5,
      thin: true,
      homeAway: "home"
    };
  }
  if (!away && competitors[1]) {
    const t = competitors[1].team || competitors[1].athlete || {};
    away = {
      abbr: t.abbreviation || t.shortDisplayName || t.displayName || "B",
      name: t.displayName || "B",
      record: "—",
      pct: 0.5,
      thin: true,
      homeAway: "away"
    };
  }
  if (!home || !away) return null;

  const game = `${away.abbr} @ ${home.abbr}`;
  const oddsArr = comp.odds || [];
  const price = oddsArr[0]?.details || null;
  const form = `${away.abbr} ${away.record} (pct ${(away.pct * 100).toFixed(0)}%) · ${home.abbr} ${home.record} (pct ${(home.pct * 100).toFixed(0)}%)`;
  const situational = `Public ESPN · ${status} · ${ev.date || ""} · ${(comp.venue || {}).fullName || "—"}`;
  const sampleNote =
    away.thin || home.thin ? "thin sample / limited games in record" : "season record sample available";
  const missing =
    "No verified injury report, lineup confirmation, or deep market from this feed.";

  const mk = (side, other) => ({
    selection: `${side.abbr} ML`,
    game,
    sport: sportKey.toUpperCase(),
    market: "ml",
    price: price || "—",
    form,
    situational,
    sampleNote,
    missing,
    supporting:
      side.pct >= other.pct + 0.08
        ? `${side.abbr} holds stronger season record vs ${other.abbr}`
        : `Close season records — limited edge from standings alone`,
    opposing: "Record edge alone is weak; injuries/lineups/odds not fully verified",
    openPrice: null,
    currentPrice: price,
    eventId: ev.id,
    status,
    analyzedAt: isoNow(),
    lastVerified: isoNow(),
    _recordGap: side.pct - other.pct
  });

  return [mk(home, away), mk(away, home)];
}

function rankScore(item) {
  const model = item.modelProb != null ? item.modelProb : 0.5;
  const edge = item.edge != null ? item.edge : 0;
  const gap = item._recordGap != null ? item._recordGap : 0;
  const dq = item.dataQuality === "High" ? 0.03 : item.dataQuality === "Medium" ? 0.015 : 0;
  return model * 100 + edge + gap * 20 + dq * 100;
}

/**
 * Run full pipeline for one category key.
 * Always returns a visible result object — never silent skip.
 */
export async function runCategoryPipeline(categoryKey) {
  const cat = getCategory(categoryKey);
  const stamp = nowStamp();
  const created = isoNow();

  if (!cat) {
    return {
      key: categoryKey,
      label: String(categoryKey || "unknown").toUpperCase(),
      emoji: "❓",
      status: "UNKNOWN_CATEGORY",
      noVerifiedPick: true,
      reason: `Category "${categoryKey}" is not in the master registry`,
      locks: [],
      leans: [],
      eventsScanned: 0,
      errors: [],
      created,
      lastVerified: created,
      stamp,
      dataStatus: "none",
      chain: {
        category: false,
        data: false,
        model: false,
        analysis: false,
        pick: false,
        display: true,
        update: false,
        history: false
      }
    };
  }

  // Kalshi / non-prediction desks
  if (cat.key === "kalshi") {
    return {
      key: cat.key,
      label: cat.label,
      emoji: cat.emoji,
      status: "GUIDANCE_ONLY",
      noVerifiedPick: true,
      reason: cat.noFeedReason || "Kalshi is guidance only",
      locks: [],
      leans: [],
      eventsScanned: 0,
      errors: [],
      created,
      lastVerified: created,
      stamp,
      dataStatus: "n/a",
      factors: cat.factors,
      chain: {
        category: true,
        data: false,
        model: false,
        analysis: false,
        pick: false,
        display: true,
        update: false,
        history: false
      }
    };
  }

  if (!cat.liveEnabled || !cat.feedKey || !FEEDS[cat.feedKey]) {
    return {
      key: cat.key,
      label: cat.label,
      emoji: cat.emoji,
      status: "NO_VERIFIED_PICK",
      noVerifiedPick: true,
      reason:
        cat.noFeedReason ||
        `No verified live data source wired for ${cat.label}`,
      locks: [],
      leans: [],
      eventsScanned: 0,
      errors: [],
      created,
      lastVerified: created,
      stamp,
      dataStatus: "no feed",
      factors: cat.factors,
      chain: {
        category: true,
        data: false,
        model: false,
        analysis: false,
        pick: false,
        display: true,
        update: false,
        history: false
      }
    };
  }

  const url = FEEDS[cat.feedKey];
  const dateKey = todayYYYYMMDD();
  const errors = [];
  let events = [];

  try {
    const data = await fetchEspn(url, dateKey);
    events = data.events || [];
  } catch (e) {
    // Retry without date filter (some feeds reject dates=)
    try {
      const data = await fetchEspn(url, null);
      events = data.events || [];
      errors.push(`date filter failed (${e.message}); used undated board`);
    } catch (e2) {
      return {
        key: cat.key,
        label: cat.label,
        emoji: cat.emoji,
        status: "NO_VERIFIED_PICK",
        noVerifiedPick: true,
        reason: `Data source error: ${e2.message}`,
        locks: [],
        leans: [],
        eventsScanned: 0,
        errors: [e.message, e2.message],
        created,
        lastVerified: isoNow(),
        stamp,
        dataStatus: "feed error",
        factors: cat.factors,
        chain: {
          category: true,
          data: false,
          model: false,
          analysis: false,
          pick: false,
          display: true,
          update: false,
          history: false
        }
      };
    }
  }

  const locks = [];
  const leans = [];
  const rejected = [];
  let candidatesAnalyzed = 0;

  for (const ev of events) {
    const cands = buildCandidates(ev, cat.key);
    if (!cands) continue;
    let best = null;
    for (const cand of cands) {
      candidatesAnalyzed++;
      const evRes = evaluateMatchup({
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
      });
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
        dataStatus: evRes.dataStatus,
        lastVerified: isoNow(),
        createdAt: created
      };

      if (evRes.playLevel === "STRONG PLAY") {
        item.tier = "LOCK";
      } else if (evRes.playLevel === "LEAN") {
        item.tier = "LEAN";
      } else {
        item.tier = "NO PLAY";
        rejected.push({
          selection: item.selection,
          game: item.game,
          reason: evRes.biggestRisk || evRes.autopsyVerdict || "Insufficient evidence"
        });
        continue;
      }

      if (!best || rankScore(item) > rankScore(best)) best = item;
    }
    if (best) {
      if (best.tier === "LOCK") locks.push(best);
      else leans.push(best);
    }
  }

  locks.sort((a, b) => rankScore(b) - rankScore(a));
  leans.sort((a, b) => rankScore(b) - rankScore(a));

  const topLocks = locks.slice(0, 5);
  const topLeans = leans.slice(0, 8);
  const hasPlay = topLocks.length + topLeans.length > 0;

  // History: ingest verified plays only
  let historyAdded = 0;
  if (hasPlay) {
    try {
      historyAdded = ingestLivePicks(
        [...topLocks, ...topLeans].map((p) => ({
          id: `${dateKey}-${p.sport}-${p.selection}-${p.eventId || ""}`,
          date: dateKey,
          sport: p.sport,
          selection: p.selection,
          market: "ml",
          odds: 0,
          units: p.tier === "LOCK" ? 1 : 0.5,
          tier: p.tier,
          game: p.game,
          eventId: p.eventId,
          reasoning: p.top3 || []
        }))
      );
    } catch (e) {
      errors.push("history ingest: " + e.message);
    }
  }

  return {
    key: cat.key,
    label: cat.label,
    emoji: cat.emoji,
    status: hasPlay ? "LIVE" : "NO_VERIFIED_PICK",
    noVerifiedPick: !hasPlay,
    reason: hasPlay
      ? null
      : events.length === 0
        ? `No live ${cat.label} events on the ESPN board right now`
        : `Scanned ${events.length} events / ${candidatesAnalyzed} sides — none cleared LOCK/LEAN evidence bar`,
    locks: topLocks,
    leans: topLeans,
    rejectedSample: rejected.slice(0, 5),
    eventsScanned: events.length,
    candidatesAnalyzed,
    errors,
    created,
    lastVerified: isoNow(),
    stamp,
    dataStatus: `ESPN ${cat.feedKey} · ${events.length} events`,
    factors: cat.factors,
    markets: cat.markets,
    historyAdded,
    chain: {
      category: true,
      data: true,
      model: true,
      analysis: true,
      pick: hasPlay,
      display: true,
      update: true,
      history: historyAdded > 0 || !hasPlay
    }
  };
}

/** Run all live-enabled categories (for /best) */
export async function runAllLiveCategories() {
  const keys = liveCategoryKeys();
  const results = [];
  for (const k of keys) {
    try {
      results.push(await runCategoryPipeline(k));
    } catch (e) {
      results.push({
        key: k,
        label: k.toUpperCase(),
        emoji: "❓",
        status: "NO_VERIFIED_PICK",
        noVerifiedPick: true,
        reason: e.message,
        locks: [],
        leans: [],
        eventsScanned: 0,
        errors: [e.message],
        created: isoNow(),
        lastVerified: isoNow(),
        stamp: nowStamp(),
        dataStatus: "error",
        chain: {
          category: true,
          data: false,
          model: false,
          analysis: false,
          pick: false,
          display: true,
          update: false,
          history: false
        }
      });
    }
  }
  return results;
}

export function registrySummary() {
  return Object.values(CATEGORY_REGISTRY).map((c) => ({
    key: c.key,
    label: c.label,
    command: c.command,
    live: c.liveEnabled,
    feed: c.feedKey || "none",
    markets: c.markets.join(",")
  }));
}
