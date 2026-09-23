/**
 * Category pipeline v11 — best available verified picks per sport.
 * Stats (records) + market (ESPN odds when present) + media (API when configured).
 */

import { evaluateMatchup } from "./analyticsEngine.js";
import { getCategory, liveCategoryKeys, CATEGORY_REGISTRY } from "./categoryRegistry.js";
import { ingestLivePicks } from "./trackerCore.js";
import { config } from "./config.js";

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
  if (total < 5) return { w, l, pct: 0.5, thin: true, total };
  return { w, l, pct: w / total, thin: total < 15, total };
}

async function fetchEspn(url, dates) {
  let u = url;
  if (dates) u += (u.includes("?") ? "&" : "?") + "dates=" + dates;
  const res = await fetch(u, {
    signal: AbortSignal.timeout(14000),
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; EDGE-PLAY-PICS/4.5)",
      Accept: "application/json"
    }
  });
  if (!res.ok) throw new Error(`ESPN HTTP ${res.status}`);
  return res.json();
}

/** Optional media feed from EDGE_PLAY_API */
async function fetchMediaItems() {
  const base = (config.apiBase || "").replace(/\/$/, "");
  if (!base) return [];
  try {
    const res = await fetch(`${base}/api/media`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j?.items) ? j.items : Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function mediaNoteForTeam(items, abbr, name) {
  if (!items?.length) return "";
  const a = String(abbr || "").toLowerCase();
  const n = String(name || "").toLowerCase();
  const hits = items.filter((i) => {
    const blob = `${i.pick || ""} ${i.text || ""} ${i.team || ""} ${i.selection || ""}`.toLowerCase();
    return (a && blob.includes(a)) || (n && n.length > 3 && blob.includes(n.slice(0, 8)));
  });
  if (!hits.length) return "";
  const h = hits[0];
  return `${h.source || "media"}: ${h.pick || h.text || "lean noted"}`;
}

function extractTeamOdds(oddsArr, homeAway) {
  if (!oddsArr?.length) return null;
  const o = oddsArr[0] || {};
  // Structured moneyline
  if (homeAway === "home" && o.homeTeamOdds?.moneyLine != null) {
    const n = Number(o.homeTeamOdds.moneyLine);
    return n > 0 ? "+" + n : String(n);
  }
  if (homeAway === "away" && o.awayTeamOdds?.moneyLine != null) {
    const n = Number(o.awayTeamOdds.moneyLine);
    return n > 0 ? "+" + n : String(n);
  }
  // Alternate keys some ESPN payloads use
  if (homeAway === "home" && o.homeOdds?.moneyLine != null) {
    const n = Number(o.homeOdds.moneyLine);
    return n > 0 ? "+" + n : String(n);
  }
  if (homeAway === "away" && o.awayOdds?.moneyLine != null) {
    const n = Number(o.awayOdds.moneyLine);
    return n > 0 ? "+" + n : String(n);
  }
  // details string often "TEAM -140" or spread line — only use if it looks like pure ML
  if (o.details && /^[+-]?\d{3,4}$/.test(String(o.details).trim())) {
    return String(o.details).trim();
  }
  return null;
}

function buildCandidates(ev, sportKey, mediaItems) {
  const comp = (ev.competitions || [])[0] || {};
  const statusType = (comp.status || {}).type || {};
  const status = statusType.description || statusType.shortDetail || "—";
  if (/final|postpon|cancel/i.test(status)) return null;

  const competitors = comp.competitors || [];
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
      total: parsed?.total ?? 0,
      homeAway: c.homeAway
    };
    if (c.homeAway === "home") home = obj;
    else if (c.homeAway === "away") away = obj;
  }
  if (!home && competitors[0]) {
    const t = competitors[0].team || competitors[0].athlete || {};
    const rec = (competitors[0].records || [])[0];
    const parsed = parseRecord(rec?.summary);
    home = {
      abbr: t.abbreviation || t.shortDisplayName || t.displayName || "A",
      name: t.displayName || "A",
      record: rec?.summary || "—",
      pct: parsed?.pct ?? 0.5,
      thin: parsed?.thin ?? true,
      total: parsed?.total ?? 0,
      homeAway: "home"
    };
  }
  if (!away && competitors[1]) {
    const t = competitors[1].team || competitors[1].athlete || {};
    const rec = (competitors[1].records || [])[0];
    const parsed = parseRecord(rec?.summary);
    away = {
      abbr: t.abbreviation || t.shortDisplayName || t.displayName || "B",
      name: t.displayName || "B",
      record: rec?.summary || "—",
      pct: parsed?.pct ?? 0.5,
      thin: parsed?.thin ?? true,
      total: parsed?.total ?? 0,
      homeAway: "away"
    };
  }
  if (!home || !away) return null;

  const game = `${away.abbr} @ ${home.abbr}`;
  const oddsArr = comp.odds || [];
  const form = `${away.abbr} ${away.record} (${(away.pct * 100).toFixed(0)}%) · ${home.abbr} ${home.record} (${(home.pct * 100).toFixed(0)}%)`;
  const situational = `ESPN · ${status} · ${ev.date || ""} · ${(comp.venue || {}).fullName || "—"}`;
  const sampleNote =
    away.thin || home.thin
      ? "thin sample / limited games in record"
      : `sample n≈${Math.min(away.total || 99, home.total || 99)} games`;
  const missing =
    "Injuries/lineups not confirmed on this public feed — factored as uncertainty.";

  const mk = (side, other, isHome) => {
    const gap = side.pct - other.pct;
    const price =
      extractTeamOdds(oddsArr, isHome ? "home" : "away") ||
      extractTeamOdds(oddsArr, isHome ? "home" : "away") ||
      "—";
    const media = mediaNoteForTeam(mediaItems, side.abbr, side.name);
    const strong = gap >= 0.08;
    return {
      selection: `${side.abbr} ML`,
      game,
      sport: sportKey.toUpperCase(),
      market: "ml",
      price,
      form,
      situational,
      sampleNote,
      missing,
      media,
      mediaNote: media,
      supporting: strong
        ? `${side.abbr} holds stronger season win% (${(side.pct * 100).toFixed(0)}% vs ${(other.pct * 100).toFixed(0)}%)`
        : `Close season records — limited standings edge`,
      opposing: "Public feed lacks full injury/lineup confirmation",
      openPrice: null,
      currentPrice: price !== "—" ? price : null,
      eventId: ev.id,
      status,
      analyzedAt: isoNow(),
      lastVerified: isoNow(),
      recordGap: gap,
      sidePct: side.pct,
      isHome,
      _recordGap: gap
    };
  };

  return [mk(home, away, true), mk(away, home, false)];
}

function rankScore(item) {
  const model = item.modelProb != null ? item.modelProb : 0.5;
  const edge = item.edge != null ? item.edge : 0;
  const gap = item._recordGap != null ? item._recordGap : 0;
  const dq = item.dataQuality === "High" ? 4 : item.dataQuality === "Medium" ? 2 : 0;
  const mediaBonus = item.media || item.mediaNote ? 1.5 : 0;
  const lockBonus = item.tier === "LOCK" ? 8 : 0;
  return model * 100 + edge * 1.2 + gap * 35 + dq + mediaBonus + lockBonus;
}

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
      reason: cat.noFeedReason || `No verified live data source for ${cat.label}`,
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
  const mediaItems = await fetchMediaItems();

  try {
    const data = await fetchEspn(url, dateKey);
    events = data.events || [];
  } catch (e) {
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

  // Analyze all sides, keep best playable per event, then global rank
  for (const ev of events) {
    const cands = buildCandidates(ev, cat.key, mediaItems);
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
        currentPrice: cand.currentPrice,
        recordGap: cand.recordGap,
        sidePct: cand.sidePct,
        isHome: cand.isHome,
        media: cand.media,
        mediaNote: cand.mediaNote
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

      if (evRes.playLevel === "STRONG PLAY") item.tier = "LOCK";
      else if (evRes.playLevel === "LEAN") item.tier = "LEAN";
      else {
        item.tier = "NO PLAY";
        rejected.push({
          selection: item.selection,
          game: item.game,
          reason: evRes.biggestRisk || "Insufficient evidence"
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

  // Global best-of: if no locks, promote top lean quality only (already LEAN)
  const topLocks = locks.slice(0, 5);
  const topLeans = leans.slice(0, 8);
  const hasPlay = topLocks.length + topLeans.length > 0;

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
        : `Scanned ${events.length} events / ${candidatesAnalyzed} sides — none cleared evidence bar (need solid record gap / sample)`,
    locks: topLocks,
    leans: topLeans,
    rejectedSample: rejected.slice(0, 5),
    eventsScanned: events.length,
    candidatesAnalyzed,
    mediaSignals: mediaItems.length,
    errors,
    created,
    lastVerified: isoNow(),
    stamp,
    dataStatus: `ESPN ${cat.feedKey} · ${events.length} events · media ${mediaItems.length}`,
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
