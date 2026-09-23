/**
 * EDGE PLAY — Evidence-based multi-factor AI decision engine (v8)
 *
 * CORE RULE: NEVER force a lock.
 * Outcomes: 🟢 STRONG PLAY | 🟡 LEAN | 🔴 NO PLAY
 *
 * Pipeline:
 *  1. Multi-factor evaluation (case FOR)
 *  2. Market Intelligence Engine (price vs model, movement, public)
 *  3. What-If Scenario Engine (ROBUST / SENSITIVE / FRAGILE)
 *  4. Prediction Autopsy Engine (case AGAINST)
 *  5. Only survivors of FOR + AGAINST + non-FRAGILE are presented as STRONG PLAY
 *
 * Principles:
 * - Verified data only (anti-hallucination)
 * - Multi-factor weighted scoring
 * - Sample-size protection
 * - Conflicting-data awareness
 * - Market-value (prob + price) separated from sentiment
 * - Model agreement when available
 * - Red-flag detection
 * - Adversarial autopsy before display
 * - What-if sensitivity testing (ROBUST/SENSITIVE/FRAGILE)
 * - Full explainability (top 3 reasons + biggest risk + market signal + what-if)
 */

/* ───────────────────────── helpers ───────────────────────── */

function safeNum(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

/** American / Kalshi cents → implied probability (0–1) */
export function parseOddsToImplied(price) {
  if (price == null || price === "—" || price === "") {
    return { implied: null, oddsDisplay: "—", source: "none" };
  }
  const s = String(price).trim();
  const cent = s.match(/(\d{1,3})\s*¢/);
  if (cent) {
    const c = clamp(Number(cent[1]), 1, 99);
    return { implied: c / 100, oddsDisplay: c + "¢", source: "kalshi_cent" };
  }
  const band = s.match(/(\d{1,3})\s*[–-]\s*(\d{1,3})\s*¢/);
  if (band) {
    const mid = (Number(band[1]) + Number(band[2])) / 2;
    return { implied: mid / 100, oddsDisplay: band[1] + "–" + band[2] + "¢", source: "kalshi_band" };
  }
  const am = s.match(/([+-]?\d{3,4})/);
  if (am) {
    const n = Number(am[1]);
    const implied = n > 0 ? 100 / (n + 100) : Math.abs(n) / (Math.abs(n) + 100);
    return { implied, oddsDisplay: n > 0 ? "+" + n : String(n), source: "american" };
  }
  return { implied: null, oddsDisplay: s.slice(0, 40), source: "unparsed" };
}

function isThinSample(text = "") {
  return /\b(1-0|0-1|2-0|0-2|3-0|0-3|small sample|thin sample|one week|last 1|last 2|last 3|n=\s*[1-5]\b|only \d games?|few games)/i.test(
    String(text)
  );
}

const RED_FLAG_PATTERNS = [
  { re: /injury uncertainty|questionable|doubtful|game-time decision|GTD/i, flag: "Injury uncertainty" },
  { re: /unknown lineup|lineup not confirmed|starting (pitcher|QB|goalie) TBA|TBD starter/i, flag: "Unknown starting lineup" },
  { re: /small sample|thin sample|n=\s*[1-5]\b|only [1-5] games?/i, flag: "Extremely small sample" },
  { re: /conflicting|mixed signals|split indicators/i, flag: "Conflicting statistics" },
  { re: /no odds|odds unavailable|missing price/i, flag: "Missing odds" },
  { re: /line move|steam|reverse line movement|sharp money/i, flag: "Large market movement" },
  { re: /outdated|stale data|last updated.*(yesterday|hours ago)/i, flag: "Outdated information" },
  { re: /unusual matchup|first meeting|no H2H/i, flag: "Unusual / limited matchup history" },
  { re: /different competition|exhibition|preseason|all-star/i, flag: "Data from different competition" },
  { re: /inconsistent stats|suspicious|data quality low/i, flag: "Suspicious or inconsistent statistics" },
  { re: /insufficient (history|data|sample)/i, flag: "Insufficient historical data" }
];

function detectRedFlags(ctx = {}) {
  const blob = [ctx.form, ctx.situational, ctx.sampleNote, ctx.missing, ctx.opposing, ctx.bothSides, ctx.kill, ctx.stressFail, ctx.facts, ctx.notes, ctx.game, ctx.selection].filter(Boolean).join(" | ");
  const flags = [];
  for (const { re, flag } of RED_FLAG_PATTERNS) {
    if (re.test(blob)) flags.push(flag);
  }
  if (!ctx.price || ctx.price === "—") flags.push("Missing odds");
  if (isThinSample(blob)) flags.push("Extremely small sample");
  return [...new Set(flags)];
}

const SPORT_WEIGHTS = {
  NFL: { form: 0.12, season: 0.14, opponent: 0.1, homeAway: 0.08, h2h: 0.04, injuries: 0.12, lineups: 0.1, matchupStats: 0.08, rest: 0.06, advanced: 0.06, market: 0.05, trends: 0.03, reliability: 0.02 },
  NBA: { form: 0.14, season: 0.12, opponent: 0.1, homeAway: 0.08, h2h: 0.05, injuries: 0.14, lineups: 0.1, matchupStats: 0.07, rest: 0.06, advanced: 0.06, market: 0.04, trends: 0.02, reliability: 0.02 },
  MLB: { form: 0.1, season: 0.12, opponent: 0.08, homeAway: 0.06, h2h: 0.04, injuries: 0.08, lineups: 0.14, matchupStats: 0.12, rest: 0.04, advanced: 0.1, market: 0.06, trends: 0.04, reliability: 0.02 },
  NHL: { form: 0.13, season: 0.12, opponent: 0.09, homeAway: 0.07, h2h: 0.04, injuries: 0.1, lineups: 0.12, matchupStats: 0.08, rest: 0.07, advanced: 0.08, market: 0.05, trends: 0.03, reliability: 0.02 },
  NCAAF: { form: 0.11, season: 0.13, opponent: 0.12, homeAway: 0.1, h2h: 0.05, injuries: 0.1, lineups: 0.08, matchupStats: 0.08, rest: 0.05, advanced: 0.06, market: 0.06, trends: 0.04, reliability: 0.02 },
  TENNIS: { form: 0.16, season: 0.12, opponent: 0.08, homeAway: 0.02, h2h: 0.1, injuries: 0.08, lineups: 0.02, matchupStats: 0.14, rest: 0.06, advanced: 0.08, market: 0.08, trends: 0.04, reliability: 0.02 },
  DEFAULT: { form: 0.12, season: 0.12, opponent: 0.1, homeAway: 0.07, h2h: 0.05, injuries: 0.1, lineups: 0.1, matchupStats: 0.08, rest: 0.05, advanced: 0.07, market: 0.07, trends: 0.04, reliability: 0.03 }
};

function recencyBlend(sport) {
  const s = (sport || "").toUpperCase();
  if (s === "NBA" || s === "NHL") return { recent: 0.45, season: 0.4, long: 0.15 };
  if (s === "NFL" || s === "NCAAF") return { recent: 0.35, season: 0.45, long: 0.2 };
  if (s === "MLB") return { recent: 0.3, season: 0.5, long: 0.2 };
  if (s === "TENNIS") return { recent: 0.5, season: 0.35, long: 0.15 };
  return { recent: 0.4, season: 0.4, long: 0.2 };
}

function scoreFactor(name, ctx) {
  const text = String(ctx[name] || ctx.form || ctx.situational || "").toLowerCase();
  let score = 0.5, available = false, note = "";
  if (ctx[name] || (name === "form" && ctx.form) || (name === "season" && ctx.season)) available = true;
  if (/strong|dominant|elite|excellent|hot|rolling|cover|outperform|edge|advantage|favorable/i.test(text)) { score = 0.72; note = "positive signal"; }
  if (/very strong|massive edge|clear edge|elite form/i.test(text)) { score = 0.82; note = "strong positive"; }
  if (/weak|cold|struggling|poor|fade|against|unfavorable|concern/i.test(text)) { score = 0.32; note = "negative signal"; }
  if (/injury|out|doubtful|questionable/i.test(text) && (name === "injuries" || name === "lineups")) { score = 0.25; note = "availability risk"; available = true; }
  if (!available || /—|n\/a|unknown|not available|missing/i.test(text)) { score = 0.5; available = false; note = "data unavailable"; }
  if (isThinSample(text) || isThinSample(ctx.sampleNote)) { score = 0.5 + (score - 0.5) * 0.4; note = (note ? note + "; " : "") + "thin sample → reduced weight"; }
  return { score, note, available };
}

/* See repo history for full Market Intelligence, Autopsy, and multi-factor body.
 * This file is the complete v8 engine — content continued via raw file push.
 * BOOTSTRAP: if this stub is live, start.sh should be updated. Full engine follows.
 */
export function runMarketIntelligence(ctx = {}, modelProb = null) {
  const openRaw = ctx.openPrice || ctx.openingLine || ctx.open || ctx.oddsOpen || null;
  const currentRaw = ctx.price || ctx.currentPrice || ctx.odds || ctx.priceGuide || null;
  const publicPct = safeNum(ctx.publicPct ?? ctx.publicPercent ?? ctx.betPct ?? ctx.ticketPct, null);
  const moneyPct = safeNum(ctx.moneyPct ?? ctx.handlePct ?? ctx.publicMoney, null);
  const movementNote = ctx.lineMove || ctx.movement || ctx.steam || null;
  const openParsed = parseOddsToImplied(openRaw);
  const currentParsed = parseOddsToImplied(currentRaw);
  const hasOpen = openParsed.implied != null;
  const hasCurrent = currentParsed.implied != null;
  const hasAnyMarket = hasOpen || hasCurrent;
  let movementDisplay = null, movementDir = null, movementMagnitude = null;
  if (hasOpen && hasCurrent) {
    const delta = currentParsed.implied - openParsed.implied;
    movementMagnitude = Math.round(Math.abs(delta) * 1000) / 10;
    if (Math.abs(delta) < 0.005) { movementDir = "flat"; movementDisplay = openParsed.oddsDisplay + " → " + currentParsed.oddsDisplay + " (flat)"; }
    else if (delta > 0) { movementDir = "toward"; movementDisplay = openParsed.oddsDisplay + " → " + currentParsed.oddsDisplay + " (toward side, +" + movementMagnitude + "pp implied)"; }
    else { movementDir = "against"; movementDisplay = openParsed.oddsDisplay + " → " + currentParsed.oddsDisplay + " (against side, −" + movementMagnitude + "pp implied)"; }
  } else if (movementNote && typeof movementNote === "string" && movementNote.length > 2) {
    movementDisplay = String(movementNote).slice(0, 80);
    if (/steam|sharp|toward|on side|into/i.test(movementNote)) movementDir = "toward";
    else if (/away|off side|reverse|against/i.test(movementNote)) movementDir = "against";
  }
  const implied = hasCurrent ? currentParsed.implied : hasOpen ? openParsed.implied : null;
  const oddsDisplay = hasCurrent ? currentParsed.oddsDisplay : hasOpen ? openParsed.oddsDisplay : "—";
  let edge = null;
  if (modelProb != null && implied != null) edge = Math.round((modelProb - implied) * 1000) / 10;
  let publicSignal = null;
  if (publicPct != null) {
    const modelPct = modelProb != null ? Math.round(modelProb * 100) : null;
    publicSignal = { publicPct, moneyPct, modelPct, divergence: modelPct != null ? publicPct - modelPct : null };
  }
  let interpretation = null, valueAssessment = null;
  if (!hasAnyMarket) {
    interpretation = "Market information unavailable — no opening line, current price, or public data supplied. Model stands alone.";
    valueAssessment = "Cannot assess price value without odds.";
  } else {
    const parts = [];
    if (hasOpen && hasCurrent && movementDir === "toward") parts.push("Line has moved toward this side since open (market priced more confidence in the selection).");
    else if (hasOpen && hasCurrent && movementDir === "against") parts.push("Line has moved against this side since open (market priced less confidence in the selection).");
    else if (hasOpen && hasCurrent && movementDir === "flat") parts.push("Line essentially unchanged from open.");
    else if (hasCurrent && !hasOpen) parts.push("Current price available; opening line not supplied — movement unknown.");
    if (movementDir === "toward") parts.push("Movement toward the side does not by itself prove the selection is stronger — it indicates where money/liability has pushed the number.");
    else if (movementDir === "against") parts.push("Movement against the side does not by itself prove the selection is weaker — it may reflect public lean, injury news, or liability management.");
    if (publicSignal) {
      if (publicSignal.divergence != null && publicSignal.divergence >= 15) parts.push("Public tickets (~" + publicPct + "%) run meaningfully above model (" + publicSignal.modelPct + "%) — public lean is heavier than the statistical read.");
      else if (publicSignal.divergence != null && publicSignal.divergence <= -15) parts.push("Public tickets (~" + publicPct + "%) run meaningfully below model (" + publicSignal.modelPct + "%) — market public is cooler than the statistical read.");
      else if (publicSignal.divergence != null) parts.push("Public (~" + publicPct + "%) roughly aligned with model (" + publicSignal.modelPct + "%).");
      parts.push("Public percentage is a sentiment indicator, not a correctness signal.");
    }
    if (edge != null) {
      if (edge >= 3) valueAssessment = "Current price still offers meaningful value (edge +" + edge + "% vs model).";
      else if (edge >= 1) valueAssessment = "Current price offers modest value (edge +" + edge + "%).";
      else if (edge > -1) valueAssessment = "Current price is roughly efficient (edge ~" + edge + "%) — little margin.";
      else valueAssessment = "Current price is unfavorable vs model (edge " + edge + "%) — attractiveness reduced.";
    } else valueAssessment = "Edge not computable (missing model or implied).";
    if (movementDir === "toward" && edge != null && edge < 0) parts.push("Market has moved toward the side and price is now short of model — value has compressed.");
    else if (movementDir === "against" && edge != null && edge >= 2) parts.push("Market has moved against the side while model still shows positive edge — possible value if thesis holds.");
    interpretation = parts.length ? parts.join(" ") : "Current price observed; limited movement/public context.";
  }
  let attractivenessDelta = "unchanged";
  if (!hasAnyMarket) attractivenessDelta = "unknown (no market data)";
  else if (edge != null) {
    if (edge >= 3) attractivenessDelta = "improved / still attractive";
    else if (edge >= 1) attractivenessDelta = "modestly attractive";
    else if (edge > -1) attractivenessDelta = "neutral — price does not add conviction";
    else if (edge > -3) attractivenessDelta = "reduced — price works against the pick";
    else attractivenessDelta = "materially reduced — poor value at current number";
  }
  const signalBlock = hasAnyMarket
    ? ["📈 MARKET SIGNAL", "• Opening: " + (hasOpen ? openParsed.oddsDisplay : "unavailable"), "• Current: " + (hasCurrent ? currentParsed.oddsDisplay : "unavailable"), "• Movement: " + (movementDisplay || "unavailable"), "• Model probability: " + (modelProb != null ? Math.round(modelProb * 100) + "%" : "unavailable"), "• Implied probability: " + (implied != null ? Math.round(implied * 100) + "%" : "unavailable"), "• Estimated edge: " + (edge != null ? (edge >= 0 ? "+" : "") + edge + "%" : "unavailable"), publicPct != null ? "• Public tickets: " + publicPct + "%" : null, moneyPct != null ? "• Public handle: " + moneyPct + "%" : null, "• Value read: " + valueAssessment, "• Attractiveness vs model: " + attractivenessDelta].filter(Boolean).join("\n")
    : ["📈 MARKET SIGNAL", "• Opening: unavailable", "• Current: unavailable", "• Movement: unavailable", "• Model probability: " + (modelProb != null ? Math.round(modelProb * 100) + "%" : "unavailable"), "• Implied probability: unavailable", "• Estimated edge: unavailable", "• Market information not supplied — no line or public data invented."].join("\n");
  return { available: hasAnyMarket, opening: hasOpen ? openParsed.oddsDisplay : null, openingImplied: hasOpen ? Math.round(openParsed.implied * 1000) / 10 : null, current: hasCurrent ? currentParsed.oddsDisplay : null, currentImplied: hasCurrent ? Math.round(currentParsed.implied * 1000) / 10 : null, oddsDisplay, implied, movement: movementDisplay, movementDir, movementMagnitude, publicPct: publicPct != null ? publicPct : null, moneyPct: moneyPct != null ? moneyPct : null, publicSignal, modelProb: modelProb != null ? Math.round(modelProb * 1000) / 10 : null, modelProbPct: modelProb != null ? Math.round(modelProb * 100) : null, impliedProbPct: implied != null ? Math.round(implied * 100) : null, edge, interpretation, valueAssessment, attractivenessDelta, signalBlock };
}

export function runWhatIfScenarios(preliminary, ctx = {}) {
  const scenarios = [];
  const baseProb = preliminary.modelProb ?? 0.5;
  const factors = preliminary.factors || {};
  const sport = (preliminary.sport || "").toUpperCase();
  const redFlags = preliminary.redFlags || [];
  const form = String(ctx.form || preliminary.form || "");
  const situational = String(ctx.situational || preliminary.situational || "");
  const sampleNote = String(ctx.sampleNote || preliminary.sampleNote || "");
  const missing = String(ctx.missing || preliminary.missing || "");
  const kill = String(ctx.kill || preliminary.kill || "");
  function shock(name, deltaProb, assumption, available) {
    if (!available) { scenarios.push({ name, ran: false, reason: "Insufficient data to run this scenario", directionHeld: null, stillPlayable: null }); return; }
    const newProb = clamp(baseProb + deltaProb, 0.35, 0.78);
    const directionHeld = (baseProb >= 0.5 && newProb >= 0.5) || (baseProb < 0.5 && newProb < 0.5);
    scenarios.push({ name, ran: true, assumption, deltaProb: Math.round(deltaProb * 1000) / 10, newProb: Math.round(newProb * 1000) / 10, newProbPct: Math.round(newProb * 100), directionHeld, stillPlayable: newProb >= 0.52 });
  }
  const playerMention = /star|ace|key player|lead|RB1|WR1|QB|ace SP|ace goalie|superstar/i.test(form + " " + String(ctx.supporting || ""));
  const usageSensitive = sport === "NBA" || sport === "NFL" || /minutes|usage|touches/i.test(form + situational);
  shock("Key player limited minutes / reduced usage", playerMention || usageSensitive ? -0.06 : -0.03, "Model assumption: primary contributor sees reduced role.", true);
  const spRelevant = sport === "MLB" || sport === "NHL" || /pitcher|SP|starter|goalie|QB/i.test(form + situational + missing + kill);
  shock("Starting pitcher / confirmed starter scratched", spRelevant ? -0.08 : -0.04, "Model assumption: projected starter unavailable; replacement-level starter.", true);
  const lineupRisk = redFlags.includes("Unknown starting lineup") || /lineup|rotation|TBA|unconfirmed/i.test(missing + situational + kill);
  shock("Material lineup / rotation change", lineupRisk ? -0.07 : -0.035, lineupRisk ? "Available signal: lineup not fully confirmed — assume adverse change." : "Model assumption: projected starters swapped.", true);
  const defenseMention = /defender|shutdown|coverage|matchup problem|elite defense/i.test(form + situational + String(ctx.opposing || ""));
  shock("Opponent best defender / shutdown unit active", defenseMention ? -0.05 : -0.025, "Model assumption: opponent fields strongest available defensive unit.", true);
  const formHeavy = factors.form?.available && factors.form.score >= 0.65;
  if (formHeavy) { const formContribution = (factors.form.score - 0.5) * 0.12; shock("Recent form ignored (season / long-term only)", -Math.abs(formContribution) - 0.01, "Uses available factor scores: form signal zeroed; season/long-term retained.", true); }
  else shock("Recent form ignored (season / long-term only)", -0.02, "Form was not a primary driver; small adjustment only.", !!(factors.form?.available || factors.season?.available));
  const thinRecent = isThinSample(form + " " + sampleNote) || /last 5|L5|last five/i.test(form + sampleNote);
  shock("Last 5 games excluded", thinRecent ? -0.05 : -0.025, thinRecent ? "Available note indicates small/recent sample — excluding it removes support." : "Model assumption: short-term results removed from form.", true);
  const homeMention = /home|at home|home field|home court|home ice/i.test(situational + form);
  shock("Home advantage removed", homeMention ? -0.04 : -0.02, homeMention ? "Available situational signal references home — zero home edge." : "Model assumption: neutral site.", true);
  const mkt = preliminary.market;
  if (mkt && mkt.implied != null) {
    const adverseImplied = Math.min(0.85, mkt.implied + 0.04);
    const newEdge = baseProb - adverseImplied;
    scenarios.push({ name: "Market moves significantly against the side", ran: true, assumption: "Model assumption: implied probability rises ~4pp (price shortens).", deltaProb: 0, newProb: Math.round(baseProb * 1000) / 10, newProbPct: Math.round(baseProb * 100), newEdge: Math.round(newEdge * 1000) / 10, directionHeld: true, stillPlayable: newEdge >= 0.01 && baseProb >= 0.52, edgeDestroyed: newEdge < 0.01 });
  } else scenarios.push({ name: "Market moves significantly against the side", ran: false, reason: "No current price/implied available — cannot simulate market move", directionHeld: null, stillPlayable: null });
  const ran = scenarios.filter((s) => s.ran);
  const brokeDirection = ran.filter((s) => s.directionHeld === false);
  const becameUnplayable = ran.filter((s) => s.stillPlayable === false || s.edgeDestroyed === true);
  const largeShocks = ran.filter((s) => s.deltaProb != null && Math.abs(s.deltaProb) >= 5);
  let classification = "ROBUST", classificationNote = "Prediction remains directionally consistent across tested scenarios.";
  if (becameUnplayable.length >= 3 || brokeDirection.length >= 2) { classification = "FRAGILE"; classificationNote = "Small or realistic changes substantially alter or invalidate the prediction."; }
  else if (becameUnplayable.length >= 1 || brokeDirection.length >= 1 || largeShocks.length >= 3) { classification = "SENSITIVE"; classificationNote = "Prediction changes under one or more realistic scenarios."; }
  if (preliminary.dataQuality === "Low" && classification === "ROBUST") { classification = "SENSITIVE"; classificationNote = "Limited data coverage prevents a ROBUST claim — treated as SENSITIVE."; }
  const breaking = [...becameUnplayable, ...brokeDirection].filter((s, i, arr) => arr.findIndex((x) => x.name === s.name) === i).slice(0, 3).map((s) => s.name);
  const displayBlock = ["🧪 WHAT-IF: " + classification, "• " + classificationNote, ...ran.slice(0, 4).map((s) => { const status = !s.stillPlayable || s.edgeDestroyed ? "breaks" : s.directionHeld === false ? "flips" : "holds"; return "• " + s.name + ": " + status + (s.newProbPct != null ? " → ~" + s.newProbPct + "%" : ""); }), breaking.length ? "• Critical sensitivities: " + breaking.join("; ") : null].filter(Boolean).join("\n");
  return { classification, classificationNote, scenarios, ranCount: ran.length, brokeDirectionCount: brokeDirection.length, becameUnplayableCount: becameUnplayable.length, breaking, displayBlock, isFragile: classification === "FRAGILE", isSensitive: classification === "SENSITIVE", isRobust: classification === "ROBUST" };
}

export function runPredictionAutopsy(preliminary, ctx = {}) {
  const challenges = []; let severity = 0;
  const form = String(ctx.form || preliminary.form || "");
  const opposing = String(ctx.opposing || ctx.bothSides || preliminary.opposing || "");
  const sampleNote = String(ctx.sampleNote || preliminary.sampleNote || "");
  const missing = String(ctx.missing || preliminary.missing || "");
  const kill = String(ctx.kill || ctx.stressFail || preliminary.kill || "");
  const supporting = String(ctx.supporting || preliminary.supporting || "");
  const situational = String(ctx.situational || preliminary.situational || "");
  const redFlags = preliminary.redFlags || [];
  const edge = preliminary.edge;
  const modelProb = preliminary.modelProb ?? 0.5;
  const dataQuality = preliminary.dataQuality || "Low";
  const factors = preliminary.factors || {};
  const top3 = preliminary.top3 || [];
  const market = preliminary.market || null;
  if (opposing && opposing.length > 5 && !/^—|n\/a|none/i.test(opposing)) { challenges.push({ q: "What evidence contradicts this pick?", finding: opposing.slice(0, 160), weight: 2 }); severity += 2; }
  if (preliminary.conflict) { challenges.push({ q: "What evidence contradicts this pick?", finding: "Supporting and opposing indicators both active — conflict unresolved", weight: 2.5 }); severity += 2.5; }
  const thin = isThinSample(form + " " + sampleNote);
  if (thin) { challenges.push({ q: "What statistic is most likely misleading?", finding: "Recent form or headline stat rests on a thin sample and may reverse", weight: 2 }); severity += 2; }
  if (factors.form?.available && factors.form.score >= 0.7 && factors.season?.available && factors.season.score <= 0.45) { challenges.push({ q: "What statistic is most likely misleading?", finding: "Hot recent form diverges from season-long performance — regression risk", weight: 1.5 }); severity += 1.5; }
  if (thin || redFlags.includes("Extremely small sample")) { challenges.push({ q: "Is the sample size sufficient?", finding: "No — sample is too small to treat as reliable evidence", weight: 2 }); severity += 1; }
  else if (dataQuality === "Low") { challenges.push({ q: "Is the sample size sufficient?", finding: "Data coverage is low; sample sufficiency cannot be confirmed", weight: 1.5 }); severity += 1.5; }
  const blend = recencyBlend(preliminary.sport);
  if (blend.recent >= 0.45 && factors.form?.available && factors.form.score >= 0.7) { challenges.push({ q: "Is recent form being overweighted?", finding: "Sport recency blend is " + (blend.recent * 100).toFixed(0) + "% recent — form may be overweighted vs season/long-term", weight: 1 }); severity += 1; }
  if (factors.matchupStats?.available && factors.matchupStats.score < 0.45) { challenges.push({ q: "Is the matchup actually favorable?", finding: "Matchup-specific stats do not clearly favor this side", weight: 1.5 }); severity += 1.5; }
  if (factors.opponent?.available && factors.opponent.score < 0.4) { challenges.push({ q: "Is the matchup actually favorable?", finding: "Opponent strength signal works against the pick", weight: 1.5 }); severity += 1.5; }
  if (edge != null && edge < 0) { challenges.push({ q: "Could the odds make this a poor-value selection?", finding: "Negative edge (" + edge + "%) — model probability does not beat market price", weight: 2.5 }); severity += 2.5; }
  else if (edge != null && edge < 0.015) { challenges.push({ q: "Could the odds make this a poor-value selection?", finding: "Edge is thin (" + edge + "%) — little margin for error vs closing line", weight: 1 }); severity += 1; }
  if (preliminary.implied != null && preliminary.implied >= 0.7) { challenges.push({ q: "Could the odds make this a poor-value selection?", finding: "Heavy favorite price leaves little upside; variance still exists", weight: 1 }); severity += 1; }
  if (market && market.attractivenessDelta && /materially reduced|poor value/i.test(market.attractivenessDelta)) { challenges.push({ q: "Could the odds make this a poor-value selection?", finding: market.valueAssessment || "Market price materially reduces attractiveness", weight: 2 }); severity += 2; }
  const availRisk = redFlags.includes("Injury uncertainty") || redFlags.includes("Unknown starting lineup") || /injury|questionable|doubtful|GTD|lineup|TBA|rest|back-to-back|travel/i.test(form + " " + situational + " " + missing + " " + kill);
  if (availRisk) { challenges.push({ q: "Is there an injury, lineup, rest, or situational factor that changes the analysis?", finding: "Yes — availability or situational factor is unresolved and material", weight: 2.5 }); severity += 2.5; }
  const strongest = top3[0] || supporting;
  const remainingSupport = (top3.slice(1) || []).filter(Boolean).length + (factors.season?.available && factors.season.score >= 0.6 ? 1 : 0) + (factors.matchupStats?.available && factors.matchupStats.score >= 0.6 ? 1 : 0);
  if (remainingSupport < 1 && (strongest || supporting)) { challenges.push({ q: "Would the pick still make sense if the strongest supporting statistic were removed?", finding: "No — thesis appears to rest on a single pillar; fragile", weight: 2 }); severity += 2; }
  else if (remainingSupport < 2 && dataQuality !== "High") { challenges.push({ q: "Would the pick still make sense if the strongest supporting statistic were removed?", finding: "Marginal — limited independent support beyond the top reason", weight: 1 }); severity += 1; }
  if (preliminary.implied != null && preliminary.implied >= 0.65 && /ML|moneyline/i.test(String(ctx.selection || ""))) { challenges.push({ q: "Are there alternative markets with substantially different risk?", finding: "Heavy ML price — spread or total may offer better risk/reward if edge is real", weight: 0.5 }); severity += 0.5; }
  if (modelProb >= 0.62 && dataQuality !== "High") { challenges.push({ q: "Is the model being overly confident?", finding: "Model at " + Math.round(modelProb * 100) + "% with only " + dataQuality + " data quality — confidence inflated", weight: 2 }); severity += 2; }
  if (modelProb >= 0.65 && (thin || redFlags.length >= 2)) { challenges.push({ q: "Is the model being overly confident?", finding: "High probability claim coexists with thin sample or multiple red flags", weight: 2 }); severity += 2; }
  severity = Math.min(10, Math.round(severity * 10) / 10);
  let action = "PASS", autopsyVerdict = "Survived adversarial review";
  if (severity >= 6) { action = "FORCE_NO_PLAY"; autopsyVerdict = "Failed autopsy — major contradictions or fragility; NO PLAY"; }
  else if (severity >= 3.5) { action = "DOWNGRADE"; autopsyVerdict = "Autopsy found material weaknesses — downgrade confidence"; }
  else if (severity >= 1.5) { action = "CAUTION"; autopsyVerdict = "Autopsy raised secondary concerns — proceed with reduced size only"; }
  const sorted = [...challenges].sort((a, b) => b.weight - a.weight);
  const topChallenge = sorted[0]?.finding || null;
  return { challenges, severity, action, autopsyVerdict, topChallenge, challengeCount: challenges.length, survived: action === "PASS" || action === "CAUTION" };
}

export function evaluateMatchup(ctx = {}) {
  const sport = (ctx.sport || "DEFAULT").toUpperCase();
  const weights = SPORT_WEIGHTS[sport] || SPORT_WEIGHTS.DEFAULT;
  const blend = recencyBlend(sport);
  const factors = {}; let weightedSum = 0, weightUsed = 0, availableCount = 0; const notes = [];
  for (const [name, w] of Object.entries(weights)) {
    const f = scoreFactor(name, ctx); factors[name] = f;
    if (f.available) { weightedSum += f.score * w; weightUsed += w; availableCount++; if (f.note) notes.push(name + ": " + f.note); }
  }
  const dataCoverage = weightUsed;
  let rawScore = weightUsed > 0.15 ? weightedSum / weightUsed : 0.5;
  const recencyNote = "Recency blend (" + sport + "): recent " + (blend.recent * 100).toFixed(0) + "% / season " + (blend.season * 100).toFixed(0) + "% / long-term " + (blend.long * 100).toFixed(0) + "%.";
  let modelProb = rawScore;
  if (dataCoverage < 0.4) modelProb = 0.5 + (modelProb - 0.5) * 0.5;
  modelProb = clamp(modelProb, 0.42, 0.72);
  const signals = ctx.signals || ctx.modelSignals || null; let modelAgreement = null;
  if (Array.isArray(signals) && signals.length >= 2) {
    const support = signals.filter((s) => s === true || s === "support" || s > 0).length;
    modelAgreement = support + "/" + signals.length + " signals support the pick";
    if (support / signals.length >= 0.75) modelProb = clamp(modelProb + 0.02, 0.42, 0.75);
    else if (support / signals.length <= 0.4) modelProb = clamp(modelProb - 0.03, 0.42, 0.7);
  }
  const redFlags = detectRedFlags(ctx);
  if (redFlags.length >= 3) modelProb = clamp(modelProb - 0.06, 0.4, 0.65);
  else if (redFlags.length >= 1) modelProb = clamp(modelProb - 0.03, 0.42, 0.68);
  const supporting = String(ctx.supporting || ctx.form || "");
  const opposing = String(ctx.opposing || ctx.bothSides || "");
  const conflict = supporting && opposing && /favor|edge|strong|hot/i.test(supporting) && /favor|edge|strong|hot|against|concern/i.test(opposing);
  if (conflict) { modelProb = clamp(modelProb - 0.04, 0.42, 0.66); notes.push("Conflicting indicators detected → confidence reduced"); }
  const market = runMarketIntelligence(ctx, modelProb);
  const implied = market.implied; const oddsDisplay = market.oddsDisplay; let edge = market.edge;
  if (edge != null && edge < -0.02) { modelProb = clamp(modelProb - 0.02, 0.42, 0.7); edge = Math.round((modelProb - implied) * 1000) / 10; }
  let playLevel = "NO PLAY", playEmoji = "🔴", dataQuality = "Low";
  if (dataCoverage >= 0.55 && availableCount >= 4) dataQuality = "High";
  else if (dataCoverage >= 0.3 && availableCount >= 2) dataQuality = "Medium";
  const hasNamed = !!(ctx.selection && ctx.selection !== "—" && ctx.game && ctx.game !== "—");
  const hardBlock = !hasNamed || (redFlags.includes("Missing odds") && !ctx.allowNoOdds) || redFlags.filter((f) => /Injury uncertainty|Unknown starting lineup|Extremely small sample/.test(f)).length >= 2 || ctx.tier === "PASS" || /final|postponed| — off/i.test(String(ctx.game || ""));
  if (hardBlock || dataQuality === "Low" || modelProb < 0.52) { playLevel = "NO PLAY"; playEmoji = "🔴"; }
  else if (dataQuality === "High" && modelProb >= 0.58 && (edge == null || edge >= 0.02) && redFlags.length <= 1 && !conflict) { playLevel = "STRONG PLAY"; playEmoji = "🟢"; }
  else if (modelProb >= 0.53 && dataQuality !== "Low") { playLevel = "LEAN"; playEmoji = "🟡"; }
  else { playLevel = "NO PLAY"; playEmoji = "🔴"; }
  if (playLevel === "STRONG PLAY" && edge != null && edge < 0.015) { playLevel = "LEAN"; playEmoji = "🟡"; }
  if (playLevel !== "NO PLAY" && market.attractivenessDelta && /materially reduced|poor value/i.test(market.attractivenessDelta)) {
    if (playLevel === "STRONG PLAY") { playLevel = "LEAN"; playEmoji = "🟡"; }
    else if (edge != null && edge < -0.03) { playLevel = "NO PLAY"; playEmoji = "🔴"; }
  }
  const probabilityPct = Math.round(modelProb * 100);
  const reasonCandidates = [];
  if (factors.form?.available && factors.form.score >= 0.6) reasonCandidates.push({ s: factors.form.score, t: "Recent form supports the side (" + (factors.form.note || "positive") + ")" });
  if (factors.season?.available && factors.season.score >= 0.6) reasonCandidates.push({ s: factors.season.score, t: "Season-long performance aligns" });
  if (factors.matchupStats?.available && factors.matchupStats.score >= 0.6) reasonCandidates.push({ s: factors.matchupStats.score, t: "Matchup-specific stats favorable" });
  if (factors.injuries?.available && factors.injuries.score >= 0.65) reasonCandidates.push({ s: factors.injuries.score, t: "Availability / injury picture clean" });
  if (factors.lineups?.available && factors.lineups.score >= 0.6) reasonCandidates.push({ s: factors.lineups.score, t: "Expected lineup / rotation edge" });
  if (factors.opponent?.available && factors.opponent.score >= 0.6) reasonCandidates.push({ s: factors.opponent.score, t: "Opponent strength / weakness favors this side" });
  if (edge != null && edge >= 0.03) reasonCandidates.push({ s: 0.7 + edge / 100, t: "Market value: model " + probabilityPct + "% vs implied " + Math.round(implied * 100) + "% (edge +" + edge + "%)" });
  if (ctx.supporting) reasonCandidates.push({ s: 0.65, t: String(ctx.supporting).slice(0, 120) });
  reasonCandidates.sort((a, b) => b.s - a.s);
  const top3 = reasonCandidates.slice(0, 3).map((r) => r.t);
  while (top3.length < 3) { if (top3.length === 0) top3.push("Insufficient verified statistical edge to list primary reasons"); else if (top3.length === 1) top3.push("Secondary factors mixed or limited"); else top3.push("Market / situational context secondary"); }
  let biggestRisk = "Key player availability or late lineup change can invalidate the lean";
  if (redFlags.length) biggestRisk = redFlags[0];
  else if (conflict) biggestRisk = "Conflicting indicators (form vs season / surface / opponent)";
  else if (edge != null && edge < 0) biggestRisk = "Negative edge vs market price — model likes side but price is poor";
  else if (isThinSample(ctx.sampleNote || ctx.form)) biggestRisk = "Thin sample size — recent results may not be sustainable";
  else if (ctx.opposing) biggestRisk = String(ctx.opposing).slice(0, 140);
  else if (ctx.kill || ctx.stressFail) biggestRisk = String(ctx.kill || ctx.stressFail).slice(0, 140);
  const preliminary = { sport, selection: ctx.selection || "—", game: ctx.game || "—", price: ctx.price || "—", oddsDisplay, implied, modelProb, probabilityPct, edge: edge != null ? edge : null, playLevel, playEmoji, dataQuality, dataCoverage: Math.round(dataCoverage * 100), availableCount, redFlags, conflict, modelAgreement, top3, biggestRisk, factors, form: ctx.form || "Board context only — expand last-5 / last-10 when available.", situational: ctx.situational || "Home/road, rest, travel when known.", supporting: ctx.supporting || top3[0], opposing: ctx.opposing || biggestRisk, sampleNote: ctx.sampleNote || (isThinSample(ctx.form) ? "Thin sample detected — influence reduced." : "Weight recent form without letting one-game samples dominate."), missing: ctx.missing || (dataQuality === "Low" ? "Key inputs missing (injuries, lineups, full sample)." : "Full injury report / confirmed lineup may still move."), kill: ctx.kill || biggestRisk, market };
  const whatIf = runWhatIfScenarios(preliminary, ctx);
  preliminary.whatIf = whatIf;
  if (whatIf.isFragile && playLevel === "STRONG PLAY") { playLevel = "LEAN"; playEmoji = "🟡"; preliminary.playLevel = playLevel; preliminary.playEmoji = playEmoji; }
  if (whatIf.isSensitive && playLevel === "STRONG PLAY" && dataQuality !== "High") { playLevel = "LEAN"; playEmoji = "🟡"; preliminary.playLevel = playLevel; preliminary.playEmoji = playEmoji; }
  const autopsy = runPredictionAutopsy(preliminary, ctx);
  let finalPlayLevel = playLevel, finalPlayEmoji = playEmoji, finalModelProb = modelProb, finalBiggestRisk = biggestRisk;
  if (autopsy.action === "FORCE_NO_PLAY") { finalPlayLevel = "NO PLAY"; finalPlayEmoji = "🔴"; finalModelProb = clamp(modelProb - 0.08, 0.4, 0.55); finalBiggestRisk = autopsy.topChallenge || autopsy.autopsyVerdict; }
  else if (autopsy.action === "DOWNGRADE") { if (playLevel === "STRONG PLAY") { finalPlayLevel = "LEAN"; finalPlayEmoji = "🟡"; } else if (playLevel === "LEAN") finalModelProb = clamp(modelProb - 0.04, 0.45, 0.58); finalBiggestRisk = autopsy.topChallenge || biggestRisk; }
  else if (autopsy.action === "CAUTION") { if (playLevel === "STRONG PLAY" && autopsy.severity >= 2) { finalPlayLevel = "LEAN"; finalPlayEmoji = "🟡"; } finalModelProb = clamp(modelProb - 0.02, 0.48, 0.68); if (autopsy.topChallenge) finalBiggestRisk = autopsy.topChallenge; }
  if (finalPlayLevel === "STRONG PLAY" && (autopsy.severity >= 2.5 || !autopsy.survived)) { finalPlayLevel = "LEAN"; finalPlayEmoji = "🟡"; }
  const finalProbabilityPct = Math.round(finalModelProb * 100);
  const finalEdge = edge != null && implied != null ? Math.round((finalModelProb - implied) * 1000) / 10 : edge;
  const marketFinal = runMarketIntelligence(ctx, finalModelProb);
  return { sport, selection: ctx.selection || "—", game: ctx.game || "—", price: ctx.price || "—", oddsDisplay, implied, modelProb: finalModelProb, probabilityPct: finalProbabilityPct, edge: finalEdge, playLevel: finalPlayLevel, playEmoji: finalPlayEmoji, dataQuality, dataCoverage: Math.round(dataCoverage * 100), availableCount, redFlags, conflict, modelAgreement, top3, biggestRisk: finalBiggestRisk, recencyNote, factorNotes: notes, factors, market: marketFinal, marketSignal: marketFinal.signalBlock, marketInterpretation: marketFinal.interpretation, marketValueAssessment: marketFinal.valueAssessment, whatIf, whatIfClassification: whatIf.classification, whatIfNote: whatIf.classificationNote, whatIfBlock: whatIf.displayBlock, autopsy, autopsyVerdict: autopsy.autopsyVerdict, autopsySeverity: autopsy.severity, autopsySurvived: autopsy.survived, autopsyChallenges: autopsy.challenges, confidence: dataQuality === "High" ? "HIGH" : dataQuality === "Medium" ? "MEDIUM" : "LOW", confidenceLine: dataQuality === "High" ? "Confidence **HIGH** — multiple independent factors align; still not guaranteed." : dataQuality === "Medium" ? "Confidence **MEDIUM** — solid process signals with residual uncertainty." : "Confidence **LOW** — thin coverage or red flags; prefer NO PLAY.", form: preliminary.form, situational: preliminary.situational, number: oddsDisplay, supporting: preliminary.supporting, opposing: preliminary.opposing, bothSides: preliminary.opposing, sampleNote: preliminary.sampleNote, missing: preliminary.missing, stressFail: finalBiggestRisk, kill: finalBiggestRisk, projection: "Model " + finalProbabilityPct + "% · " + finalPlayEmoji + " " + finalPlayLevel + " · Autopsy: " + autopsy.action, decision: finalPlayLevel === "STRONG PLAY" ? "🟢 STRONG PLAY · " + ctx.selection + " · survived autopsy · size only at process price" : finalPlayLevel === "LEAN" ? "🟡 LEAN · " + ctx.selection + " · reduced size" : "🔴 NO PLAY · insufficient evidence or failed autopsy", facts: ctx.facts || "Sport " + sport + " · named board when available.", media: ctx.media || "Public media = signal only. Desk sizes via process." };
}

export function scoreConfidence({ hasBoard, hasPrice, hasForm, sampleNote, missingHeavy }) {
  let pts = 0;
  if (hasBoard) pts += 1; if (hasPrice) pts += 1; if (hasForm) pts += 1;
  if (sampleNote && /small|thin|one week|1-0|0-1/i.test(sampleNote)) pts -= 1;
  if (missingHeavy) pts -= 1;
  if (pts >= 3) return { level: "HIGH", line: "Confidence **HIGH** — multiple factors align; still not guaranteed." };
  if (pts <= 0) return { level: "LOW", line: "Confidence **LOW** — thin sample or missing inputs; size down or PASS." };
  return { level: "MEDIUM", line: "Confidence **MEDIUM** — solid process; film/lineups may still move." };
}

export function buildEvidenceAnalysis(input = {}) {
  const r = evaluateMatchup(input);
  return { form: r.form, situational: r.situational, number: r.number, media: r.media, kill: r.kill, decision: r.decision, facts: r.facts, projection: r.projection, missing: r.missing, confidence: r.confidence, confidenceLine: r.confidenceLine, bothSides: r.bothSides, supporting: r.supporting, opposing: r.opposing, sampleNote: r.sampleNote, stressFail: r.stressFail, prediction: r.decision, serve: r.number, playLevel: r.playLevel, playEmoji: r.playEmoji, probabilityPct: r.probabilityPct, edge: r.edge, dataQuality: r.dataQuality, modelAgreement: r.modelAgreement, top3: r.top3, biggestRisk: r.biggestRisk, redFlags: r.redFlags, recencyNote: r.recencyNote, autopsyVerdict: r.autopsyVerdict, autopsySeverity: r.autopsySeverity, autopsySurvived: r.autopsySurvived, marketSignal: r.marketSignal, marketInterpretation: r.marketInterpretation, marketValueAssessment: r.marketValueAssessment, whatIfClassification: r.whatIfClassification, whatIfNote: r.whatIfNote, whatIfBlock: r.whatIfBlock };
}

export function stressTestPick(p) {
  const reasons = [];
  if (!p) return { ok: false, reasons: ["No pick"] };
  if (p.final) reasons.push("Game already final");
  if (/Wait next|Empty board|No NFL|No MLB|Awaiting/i.test(p.game || "")) reasons.push("Board not live yet — process lean only");
  if (!p.price || p.price === "—") reasons.push("No price band");
  if (p.tier === "PASS") reasons.push("Explicit PASS");
  return { ok: !reasons.some((r) => /final|PASS/i.test(r)), reasons };
}

export function formatAnalysisDiscord(r, why) {
  if (!r || typeof r !== "object") return why ? "_" + why + "_" : "_Run `/daily` for full analysis._";
  return ["**Form:** " + (r.form || "—"), "**Spot:** " + (r.situational || r.serve || "—"), "**Number:** " + (r.number || "—"), "**Supporting:** " + (r.supporting || r.form || "—"), "**Opposing:** " + (r.opposing || r.bothSides || "—"), "**Media:** " + (r.media || "Signal only — /media"), "**Facts:** " + (r.facts || "Board data when available"), "**Projection:** " + (r.projection || "Process lean — not guaranteed"), "**Sample:** " + (r.sampleNote || "—"), "**Missing:** " + (r.missing || "Injuries / close may move"), "**Stress fail:** " + (r.stressFail || r.kill || "—"), "**Confidence:** " + (r.confidenceLine || r.confidence || "MEDIUM"), r.autopsyVerdict ? "**Autopsy:** " + r.autopsyVerdict : null, r.marketValueAssessment ? "**Market:** " + r.marketValueAssessment : null, r.whatIfClassification ? "**What-If:** " + r.whatIfClassification : null, "**Kill:** " + (r.kill || "—"), "**Call:** " + (r.decision || r.prediction || why || "—")].filter(Boolean).join("\n");
}

export const ANALYTICS_FOOTER = "EDGE PLAY · evidence-based · market-aware · what-if gated · autopsy-gated · never force a lock · 21+";
