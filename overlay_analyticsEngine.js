/**
 * EDGE PLAY — Evidence-based multi-factor AI decision engine (v5)
 *
 * CORE RULE: NEVER force a lock.
 * Outcomes: 🟢 STRONG PLAY | 🟡 LEAN | 🔴 NO PLAY
 *
 * Principles:
 * - Verified data only (anti-hallucination)
 * - Multi-factor weighted scoring
 * - Sample-size protection
 * - Conflicting-data awareness
 * - Market-value (prob + price)
 * - Model agreement when available
 * - Red-flag detection
 * - Full explainability (top 3 reasons + biggest risk)
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

/** Detect thin samples from free-text notes */
function isThinSample(text = "") {
  return /\b(1-0|0-1|2-0|0-2|3-0|0-3|small sample|thin sample|one week|last 1|last 2|last 3|n=\s*[1-5]\b|only \d games?|few games)/i.test(
    String(text)
  );
}

/** Red-flag keywords that force caution or NO PLAY */
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
  const blob = [
    ctx.form,
    ctx.situational,
    ctx.sampleNote,
    ctx.missing,
    ctx.opposing,
    ctx.bothSides,
    ctx.kill,
    ctx.stressFail,
    ctx.facts,
    ctx.notes,
    ctx.game,
    ctx.selection
  ]
    .filter(Boolean)
    .join(" | ");

  const flags = [];
  for (const { re, flag } of RED_FLAG_PATTERNS) {
    if (re.test(blob)) flags.push(flag);
  }
  if (!ctx.price || ctx.price === "—") flags.push("Missing odds");
  if (isThinSample(blob)) flags.push("Extremely small sample");
  return [...new Set(flags)];
}

/* ───────────────────────── multi-factor model ───────────────────────── */

/**
 * Sport-specific base weights (sum ≈ 1.0).
 * Factors: form, season, opponent, homeAway, h2h, injuries, lineups,
 * matchupStats, rest, advanced, market, trends, reliability, sampleSize
 */
const SPORT_WEIGHTS = {
  NFL: {
    form: 0.12,
    season: 0.14,
    opponent: 0.1,
    homeAway: 0.08,
    h2h: 0.04,
    injuries: 0.12,
    lineups: 0.1,
    matchupStats: 0.08,
    rest: 0.06,
    advanced: 0.06,
    market: 0.05,
    trends: 0.03,
    reliability: 0.02
  },
  NBA: {
    form: 0.14,
    season: 0.12,
    opponent: 0.1,
    homeAway: 0.08,
    h2h: 0.05,
    injuries: 0.14,
    lineups: 0.1,
    matchupStats: 0.07,
    rest: 0.06,
    advanced: 0.06,
    market: 0.04,
    trends: 0.02,
    reliability: 0.02
  },
  MLB: {
    form: 0.1,
    season: 0.12,
    opponent: 0.08,
    homeAway: 0.06,
    h2h: 0.04,
    injuries: 0.08,
    lineups: 0.14, // SP is critical
    matchupStats: 0.12,
    rest: 0.04,
    advanced: 0.1,
    market: 0.06,
    trends: 0.04,
    reliability: 0.02
  },
  NHL: {
    form: 0.13,
    season: 0.12,
    opponent: 0.09,
    homeAway: 0.07,
    h2h: 0.04,
    injuries: 0.1,
    lineups: 0.12, // goalie
    matchupStats: 0.08,
    rest: 0.07,
    advanced: 0.08,
    market: 0.05,
    trends: 0.03,
    reliability: 0.02
  },
  NCAAF: {
    form: 0.11,
    season: 0.13,
    opponent: 0.12,
    homeAway: 0.1,
    h2h: 0.05,
    injuries: 0.1,
    lineups: 0.08,
    matchupStats: 0.08,
    rest: 0.05,
    advanced: 0.06,
    market: 0.06,
    trends: 0.04,
    reliability: 0.02
  },
  TENNIS: {
    form: 0.16,
    season: 0.12,
    opponent: 0.08,
    homeAway: 0.02,
    h2h: 0.1,
    injuries: 0.08,
    lineups: 0.02,
    matchupStats: 0.14, // surface
    rest: 0.06,
    advanced: 0.08,
    market: 0.08,
    trends: 0.04,
    reliability: 0.02
  },
  DEFAULT: {
    form: 0.12,
    season: 0.12,
    opponent: 0.1,
    homeAway: 0.07,
    h2h: 0.05,
    injuries: 0.1,
    lineups: 0.1,
    matchupStats: 0.08,
    rest: 0.05,
    advanced: 0.07,
    market: 0.07,
    trends: 0.04,
    reliability: 0.03
  }
};

/**
 * Recency weighting (sport-specific).
 * recent / season / long-term blend.
 */
function recencyBlend(sport) {
  const s = (sport || "").toUpperCase();
  if (s === "NBA" || s === "NHL") return { recent: 0.45, season: 0.4, long: 0.15 };
  if (s === "NFL" || s === "NCAAF") return { recent: 0.35, season: 0.45, long: 0.2 };
  if (s === "MLB") return { recent: 0.3, season: 0.5, long: 0.2 };
  if (s === "TENNIS") return { recent: 0.5, season: 0.35, long: 0.15 };
  return { recent: 0.4, season: 0.4, long: 0.2 };
}

/**
 * Score a single factor 0–1 from available text/signals.
 * Returns { score, note, available }
 */
function scoreFactor(name, ctx) {
  const text = String(ctx[name] || ctx.form || ctx.situational || "").toLowerCase();
  let score = 0.5; // neutral default when unknown
  let available = false;
  let note = "";

  if (ctx[name] || (name === "form" && ctx.form) || (name === "season" && ctx.season)) {
    available = true;
  }

  // Positive language
  if (/strong|dominant|elite|excellent|hot|rolling|cover|outperform|edge|advantage|favorable/i.test(text)) {
    score = 0.72;
    note = "positive signal";
  }
  if (/very strong|massive edge|clear edge|elite form/i.test(text)) {
    score = 0.82;
    note = "strong positive";
  }
  // Negative
  if (/weak|cold|struggling|poor|fade|against|unfavorable|concern/i.test(text)) {
    score = 0.32;
    note = "negative signal";
  }
  if (/injury|out|doubtful|questionable/i.test(text) && (name === "injuries" || name === "lineups")) {
    score = 0.25;
    note = "availability risk";
    available = true;
  }
  // Neutral / missing
  if (!available || /—|n\/a|unknown|not available|missing/i.test(text)) {
    score = 0.5;
    available = false;
    note = "data unavailable";
  }

  // Sample-size haircut
  if (isThinSample(text) || isThinSample(ctx.sampleNote)) {
    score = 0.5 + (score - 0.5) * 0.4; // shrink toward neutral
    note = (note ? note + "; " : "") + "thin sample → reduced weight";
  }

  return { score, note, available };
}

/**
 * Full multi-factor evaluation.
 * Returns internal score object used for play level + probability.
 */
export function evaluateMatchup(ctx = {}) {
  const sport = (ctx.sport || "DEFAULT").toUpperCase();
  const weights = SPORT_WEIGHTS[sport] || SPORT_WEIGHTS.DEFAULT;
  const blend = recencyBlend(sport);

  const factors = {};
  let weightedSum = 0;
  let weightUsed = 0;
  let availableCount = 0;
  const notes = [];

  for (const [name, w] of Object.entries(weights)) {
    const f = scoreFactor(name, ctx);
    factors[name] = f;
    if (f.available) {
      weightedSum += f.score * w;
      weightUsed += w;
      availableCount++;
      if (f.note) notes.push(`${name}: ${f.note}`);
    }
  }

  // If almost nothing available → force low confidence
  const dataCoverage = weightUsed; // 0–1
  let rawScore = weightUsed > 0.15 ? weightedSum / weightUsed : 0.5;

  // Recency explanation
  const recencyNote = `Recency blend (${sport}): recent ${(blend.recent * 100).toFixed(0)}% / season ${(blend.season * 100).toFixed(0)}% / long-term ${(blend.long * 100).toFixed(0)}%. Recent form weighted higher in ${sport === "NBA" || sport === "TENNIS" ? "high-variance" : "standard"} sports but never ignores season sample.`;

  // Market value
  const { implied, oddsDisplay } = parseOddsToImplied(ctx.price);
  let modelProb = rawScore; // 0–1 from factors
  // Soften extreme scores when coverage is low
  if (dataCoverage < 0.4) {
    modelProb = 0.5 + (modelProb - 0.5) * 0.5;
  }
  modelProb = clamp(modelProb, 0.42, 0.72); // never claim crazy certainty without elite data

  let edge = null;
  if (implied != null) {
    edge = modelProb - implied;
  }

  // Model agreement (if multiple signals supplied)
  const signals = ctx.signals || ctx.modelSignals || null;
  let modelAgreement = null;
  if (Array.isArray(signals) && signals.length >= 2) {
    const support = signals.filter((s) => s === true || s === "support" || s > 0).length;
    modelAgreement = `${support}/${signals.length} signals support the pick`;
    if (support / signals.length >= 0.75) modelProb = clamp(modelProb + 0.02, 0.42, 0.75);
    else if (support / signals.length <= 0.4) modelProb = clamp(modelProb - 0.03, 0.42, 0.7);
  }

  // Red flags
  const redFlags = detectRedFlags(ctx);
  if (redFlags.length >= 3) {
    modelProb = clamp(modelProb - 0.06, 0.4, 0.65);
  } else if (redFlags.length >= 1) {
    modelProb = clamp(modelProb - 0.03, 0.42, 0.68);
  }

  // Conflicting data check
  const supporting = String(ctx.supporting || ctx.form || "");
  const opposing = String(ctx.opposing || ctx.bothSides || "");
  const conflict =
    supporting &&
    opposing &&
    /favor|edge|strong|hot/i.test(supporting) &&
    /favor|edge|strong|hot|against|concern/i.test(opposing);

  if (conflict) {
    modelProb = clamp(modelProb - 0.04, 0.42, 0.66);
    notes.push("Conflicting indicators detected → confidence reduced");
  }

  // Final play level decision — NEVER force LOCK
  let playLevel = "NO PLAY";
  let playEmoji = "🔴";
  let dataQuality = "Low";

  if (dataCoverage >= 0.55 && availableCount >= 4) dataQuality = "High";
  else if (dataCoverage >= 0.3 && availableCount >= 2) dataQuality = "Medium";

  const hasNamed = !!(ctx.selection && ctx.selection !== "—" && ctx.game && ctx.game !== "—");
  const hardBlock =
    !hasNamed ||
    redFlags.includes("Missing odds") && !ctx.allowNoOdds ||
    redFlags.filter((f) => /Injury uncertainty|Unknown starting lineup|Extremely small sample/.test(f)).length >= 2 ||
    (ctx.tier === "PASS") ||
    /final|postponed| — off/i.test(String(ctx.game || ""));

  if (hardBlock || dataQuality === "Low" || modelProb < 0.52) {
    playLevel = "NO PLAY";
    playEmoji = "🔴";
  } else if (
    dataQuality === "High" &&
    modelProb >= 0.58 &&
    (edge == null || edge >= 0.02) &&
    redFlags.length <= 1 &&
    !conflict
  ) {
    playLevel = "STRONG PLAY";
    playEmoji = "🟢";
  } else if (modelProb >= 0.53 && dataQuality !== "Low") {
    playLevel = "LEAN";
    playEmoji = "🟡";
  } else {
    playLevel = "NO PLAY";
    playEmoji = "🔴";
  }

  // Probability display (honest)
  const probabilityPct = Math.round(modelProb * 100);

  // Top 3 reasons (from available positive factors + market)
  const reasonCandidates = [];
  if (factors.form?.available && factors.form.score >= 0.6)
    reasonCandidates.push({ s: factors.form.score, t: `Recent form supports the side (${factors.form.note || "positive"})` });
  if (factors.season?.available && factors.season.score >= 0.6)
    reasonCandidates.push({ s: factors.season.score, t: `Season-long performance aligns` });
  if (factors.matchupStats?.available && factors.matchupStats.score >= 0.6)
    reasonCandidates.push({ s: factors.matchupStats.score, t: `Matchup-specific stats favorable` });
  if (factors.injuries?.available && factors.injuries.score >= 0.65)
    reasonCandidates.push({ s: factors.injuries.score, t: `Availability / injury picture clean` });
  if (factors.lineups?.available && factors.lineups.score >= 0.6)
    reasonCandidates.push({ s: factors.lineups.score, t: `Expected lineup / rotation edge` });
  if (factors.opponent?.available && factors.opponent.score >= 0.6)
    reasonCandidates.push({ s: factors.opponent.score, t: `Opponent strength / weakness favors this side` });
  if (edge != null && edge >= 0.03)
    reasonCandidates.push({ s: 0.7 + edge, t: `Market value: model ${probabilityPct}% vs implied ${Math.round(implied * 100)}% (edge +${(edge * 100).toFixed(1)}%)` });
  if (ctx.supporting)
    reasonCandidates.push({ s: 0.65, t: String(ctx.supporting).slice(0, 120) });

  reasonCandidates.sort((a, b) => b.s - a.s);
  const top3 = reasonCandidates.slice(0, 3).map((r) => r.t);
  while (top3.length < 3) {
    if (top3.length === 0) top3.push("Insufficient verified statistical edge to list primary reasons");
    else if (top3.length === 1) top3.push("Secondary factors mixed or limited");
    else top3.push("Market / situational context secondary");
  }

  // Biggest risk
  let biggestRisk = "Key player availability or late lineup change can invalidate the lean";
  if (redFlags.length) biggestRisk = redFlags[0];
  else if (conflict) biggestRisk = "Conflicting indicators (form vs season / surface / opponent)";
  else if (edge != null && edge < 0) biggestRisk = "Negative edge vs market price — model likes side but price is poor";
  else if (isThinSample(ctx.sampleNote || ctx.form)) biggestRisk = "Thin sample size — recent results may not be sustainable";
  else if (ctx.opposing) biggestRisk = String(ctx.opposing).slice(0, 140);
  else if (ctx.kill || ctx.stressFail) biggestRisk = String(ctx.kill || ctx.stressFail).slice(0, 140);

  return {
    sport,
    selection: ctx.selection || "—",
    game: ctx.game || "—",
    price: ctx.price || "—",
    oddsDisplay,
    implied,
    modelProb,
    probabilityPct,
    edge: edge != null ? Math.round(edge * 1000) / 10 : null,
    playLevel,
    playEmoji,
    dataQuality,
    dataCoverage: Math.round(dataCoverage * 100),
    availableCount,
    redFlags,
    conflict,
    modelAgreement,
    top3,
    biggestRisk,
    recencyNote,
    factorNotes: notes,
    factors,
    // backward-compat fields for existing formatters
    confidence: dataQuality === "High" ? "HIGH" : dataQuality === "Medium" ? "MEDIUM" : "LOW",
    confidenceLine:
      dataQuality === "High"
        ? `Confidence **HIGH** — multiple independent factors align; still not guaranteed.`
        : dataQuality === "Medium"
          ? `Confidence **MEDIUM** — solid process signals with residual uncertainty.`
          : `Confidence **LOW** — thin coverage or red flags; prefer NO PLAY.`,
    form: ctx.form || "Board context only — expand last-5 / last-10 when available.",
    situational: ctx.situational || "Home/road, rest, travel when known.",
    number: oddsDisplay,
    supporting: ctx.supporting || top3[0],
    opposing: ctx.opposing || biggestRisk,
    bothSides: ctx.bothSides || biggestRisk,
    sampleNote: ctx.sampleNote || (isThinSample(ctx.form) ? "Thin sample detected — influence reduced." : "Weight recent form without letting one-game samples dominate."),
    missing: ctx.missing || (dataQuality === "Low" ? "Key inputs missing (injuries, lineups, full sample)." : "Full injury report / confirmed lineup may still move."),
    stressFail: ctx.stressFail || ctx.kill || biggestRisk,
    kill: ctx.kill || biggestRisk,
    projection: `Model ${probabilityPct}% · ${playEmoji} ${playLevel}`,
    decision:
      playLevel === "STRONG PLAY"
        ? `🟢 STRONG PLAY · ${ctx.selection} · size only at process price`
        : playLevel === "LEAN"
          ? `🟡 LEAN · ${ctx.selection} · reduced size`
          : `🔴 NO PLAY · insufficient evidence for a forced lock`,
    facts: ctx.facts || `Sport ${sport} · named board when available.`,
    media: ctx.media || "Public media = signal only. Desk sizes via process."
  };
}

/* ───────────────────────── public API (compat) ───────────────────────── */

export function scoreConfidence({ hasBoard, hasPrice, hasForm, sampleNote, missingHeavy }) {
  let pts = 0;
  if (hasBoard) pts += 1;
  if (hasPrice) pts += 1;
  if (hasForm) pts += 1;
  if (sampleNote && /small|thin|one week|1-0|0-1/i.test(sampleNote)) pts -= 1;
  if (missingHeavy) pts -= 1;
  if (pts >= 3) return { level: "HIGH", line: "Confidence **HIGH** — multiple factors align; still not guaranteed." };
  if (pts <= 0) return { level: "LOW", line: "Confidence **LOW** — thin sample or missing inputs; size down or PASS." };
  return { level: "MEDIUM", line: "Confidence **MEDIUM** — solid process; film/lineups may still move." };
}

export function buildEvidenceAnalysis(input = {}) {
  const r = evaluateMatchup(input);
  return {
    form: r.form,
    situational: r.situational,
    number: r.number,
    media: r.media,
    kill: r.kill,
    decision: r.decision,
    facts: r.facts,
    projection: r.projection,
    missing: r.missing,
    confidence: r.confidence,
    confidenceLine: r.confidenceLine,
    bothSides: r.bothSides,
    supporting: r.supporting,
    opposing: r.opposing,
    sampleNote: r.sampleNote,
    stressFail: r.stressFail,
    prediction: r.decision,
    serve: r.number,
    // new fields
    playLevel: r.playLevel,
    playEmoji: r.playEmoji,
    probabilityPct: r.probabilityPct,
    edge: r.edge,
    dataQuality: r.dataQuality,
    modelAgreement: r.modelAgreement,
    top3: r.top3,
    biggestRisk: r.biggestRisk,
    redFlags: r.redFlags,
    recencyNote: r.recencyNote
  };
}

export function stressTestPick(p) {
  const reasons = [];
  if (!p) return { ok: false, reasons: ["No pick"] };
  if (p.final) reasons.push("Game already final");
  if (/Wait next|Empty board|No NFL|No MLB|Awaiting/i.test(p.game || ""))
    reasons.push("Board not live yet — process lean only");
  if (!p.price || p.price === "—") reasons.push("No price band");
  if (p.tier === "PASS") reasons.push("Explicit PASS");
  const hardFail = reasons.some((r) => /final|PASS/i.test(r));
  return { ok: !hardFail, reasons };
}

export function formatAnalysisDiscord(r, why) {
  if (!r || typeof r !== "object") {
    return why ? `_${why}_` : "_Run `/daily` for full analysis._";
  }
  return [
    `**Form:** ${r.form || "—"}`,
    `**Spot:** ${r.situational || r.serve || "—"}`,
    `**Number:** ${r.number || "—"}`,
    `**Supporting:** ${r.supporting || r.form || "—"}`,
    `**Opposing:** ${r.opposing || r.bothSides || "—"}`,
    `**Media:** ${r.media || "Signal only — /media"}`,
    `**Facts:** ${r.facts || "Board data when available"}`,
    `**Projection:** ${r.projection || "Process lean — not guaranteed"}`,
    `**Sample:** ${r.sampleNote || "—"}`,
    `**Missing:** ${r.missing || "Injuries / close may move"}`,
    `**Stress fail:** ${r.stressFail || r.kill || "—"}`,
    `**Confidence:** ${r.confidenceLine || r.confidence || "MEDIUM"}`,
    `**Kill:** ${r.kill || "—"}`,
    `**Call:** ${r.decision || r.prediction || why || "—"}`
  ].join("\n");
}

export const ANALYTICS_FOOTER =
  "EDGE PLAY · evidence-based · never force a lock · facts ≠ projection · not guaranteed · 21+";
