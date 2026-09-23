/**
 * EDGE PLAY — Evidence multi-factor engine (v11.1)
 *
 * Uses: season records (quantitative), home/away, rest flags, market price,
 * optional media agreement. Never fabricates data.
 *
 * LOCK — strict (odds + edge + clean flags)
 * LEAN — strong stats / media support; odds preferred but not always required
 * NO PLAY — insufficient verified support
 */

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

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
  { re: /outdated|stale data|last updated.*(yesterday|hours ago)/i, flag: "Outdated information" },
  { re: /insufficient (history|data|sample)/i, flag: "Insufficient historical data" }
];

function detectRedFlags(ctx = {}) {
  const blob = [
    ctx.form,
    ctx.situational,
    ctx.sampleNote,
    ctx.missing,
    ctx.opposing,
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
  if (isThinSample(blob)) flags.push("Extremely small sample");
  if (!ctx.price || ctx.price === "—") flags.push("Missing odds");
  return [...new Set(flags)];
}

const SPORT_WEIGHTS = {
  MLB: { record: 0.28, homeAway: 0.1, rest: 0.05, market: 0.22, form: 0.2, matchup: 0.15 },
  NFL: { record: 0.22, homeAway: 0.12, rest: 0.1, market: 0.25, form: 0.18, matchup: 0.13 },
  NBA: { record: 0.22, homeAway: 0.1, rest: 0.12, market: 0.25, form: 0.18, matchup: 0.13 },
  NHL: { record: 0.22, homeAway: 0.1, rest: 0.08, market: 0.25, form: 0.2, matchup: 0.15 },
  NCAAF: { record: 0.25, homeAway: 0.15, rest: 0.08, market: 0.2, form: 0.2, matchup: 0.12 },
  SOCCER: { record: 0.25, homeAway: 0.15, rest: 0.05, market: 0.25, form: 0.2, matchup: 0.1 },
  TENNIS: { record: 0.15, homeAway: 0.05, rest: 0.1, market: 0.25, form: 0.3, matchup: 0.15 },
  KBO: { record: 0.28, homeAway: 0.1, rest: 0.05, market: 0.22, form: 0.2, matchup: 0.15 },
  DEFAULT: { record: 0.25, homeAway: 0.1, rest: 0.05, market: 0.25, form: 0.2, matchup: 0.15 }
};

function sportWeights(sport) {
  return SPORT_WEIGHTS[String(sport || "DEFAULT").toUpperCase()] || SPORT_WEIGHTS.DEFAULT;
}

export function runMarketIntelligence(ctx = {}, modelProb = null) {
  const openRaw = ctx.openPrice || ctx.openingLine || ctx.open || null;
  const currentRaw = ctx.price || ctx.currentPrice || ctx.odds || null;
  const openParsed = parseOddsToImplied(openRaw);
  const currentParsed = parseOddsToImplied(currentRaw);
  const hasOpen = openParsed.implied != null;
  const hasCurrent = currentParsed.implied != null;
  const hasAnyMarket = hasOpen || hasCurrent;
  const implied = hasCurrent ? currentParsed.implied : hasOpen ? openParsed.implied : null;
  const oddsDisplay = hasCurrent
    ? currentParsed.oddsDisplay
    : hasOpen
      ? openParsed.oddsDisplay
      : "—";
  let edge = null;
  if (modelProb != null && implied != null) {
    edge = Math.round((modelProb - implied) * 1000) / 10;
  }
  const valueAssessment =
    edge == null
      ? "Cannot assess price value without odds."
      : edge >= 3
        ? "Meaningful value (edge +" + edge + "% vs model)."
        : edge >= 1
          ? "Modest value (edge +" + edge + "% )."
          : edge > -1
            ? "Roughly efficient."
            : "Unfavorable vs model.";
  const signalBlock = [
    "📈 MARKET SIGNAL",
    "• Opening: " + (hasOpen ? openParsed.oddsDisplay : "unavailable"),
    "• Current: " + (hasCurrent ? currentParsed.oddsDisplay : "unavailable"),
    "• Model probability: " + (modelProb != null ? Math.round(modelProb * 100) + "%" : "unavailable"),
    "• Implied probability: " + (implied != null ? Math.round(implied * 100) + "%" : "unavailable"),
    "• Estimated edge: " + (edge != null ? (edge >= 0 ? "+" : "") + edge + "%" : "unavailable"),
    "• Value read: " + valueAssessment
  ].join("\n");
  return {
    available: hasAnyMarket,
    oddsDisplay,
    implied,
    edge,
    valueAssessment,
    signalBlock,
    interpretation: hasAnyMarket
      ? "Current price observed."
      : "No market price — ranking by stats/media only."
  };
}

export function runWhatIfScenarios(preliminary) {
  const baseProb = preliminary.modelProb ?? 0.5;
  const scenarios = [];
  function shock(name, delta) {
    const newProb = clamp(baseProb + delta, 0.35, 0.78);
    scenarios.push({
      name,
      newProb: Math.round(newProb * 1000) / 10,
      stillPlayable: newProb >= 0.52,
      directionHeld: (baseProb >= 0.5 && newProb >= 0.5) || (baseProb < 0.5 && newProb < 0.5)
    });
  }
  shock("Key player limited", -0.05);
  shock("Starter scratched", -0.07);
  shock("Lineup change", -0.04);
  const fragile = scenarios.filter((s) => !s.stillPlayable).length >= 2;
  const sensitive = scenarios.filter((s) => !s.directionHeld).length >= 1;
  const classification = fragile ? "FRAGILE" : sensitive ? "SENSITIVE" : "ROBUST";
  return {
    classification,
    scenarios,
    note:
      classification === "FRAGILE"
        ? "Fragile under stress."
        : classification === "SENSITIVE"
          ? "Sensitive to key assumptions."
          : "Holds under standard stress.",
    block: "🔬 WHAT-IF: " + classification
  };
}

export function runPredictionAutopsy(preliminary) {
  const challenges = [];
  const redFlags = preliminary.redFlags || [];
  if (redFlags.includes("Extremely small sample")) challenges.push("Sample thin");
  if (redFlags.includes("Injury uncertainty")) challenges.push("Injury status unresolved");
  if (redFlags.includes("Unknown starting lineup")) challenges.push("Starting lineup not confirmed");
  if ((preliminary.modelProb || 0) < 0.52) challenges.push("Model probability below LEAN bar");
  if ((preliminary.dataQuality || "Low") === "Low") challenges.push("Data quality low");
  const severity = challenges.length;
  const survived =
    severity < 3 &&
    (preliminary.modelProb || 0) >= 0.52 &&
    (preliminary.dataQuality || "Low") !== "Low";
  return {
    challenges,
    topChallenge: challenges[0] || "No critical autopsy failure",
    severity,
    survived,
    verdict: survived
      ? "Survived adversarial review"
      : "Failed adversarial review: " + (challenges[0] || "thin evidence")
  };
}

function computeModelProb(ctx, weights, redFlags) {
  let modelProb = 0.5;
  const gap =
    ctx.recordGap != null && Number.isFinite(Number(ctx.recordGap))
      ? Number(ctx.recordGap)
      : null;
  const sidePct =
    ctx.sidePct != null && Number.isFinite(Number(ctx.sidePct)) ? Number(ctx.sidePct) : null;

  if (gap != null) {
    modelProb = clamp(0.5 + gap * 0.55 * (weights.record / 0.25), 0.42, 0.66);
  } else if (sidePct != null) {
    modelProb = clamp(0.45 + sidePct * 0.2, 0.42, 0.62);
  } else {
    const supporting = String(ctx.supporting || "");
    const form = String(ctx.form || "");
    if (/stronger season record|holds stronger|clear edge|elite form|dominant/i.test(supporting + form))
      modelProb = 0.58;
    else if (/close season records|limited edge|close records/i.test(supporting + form))
      modelProb = 0.52;
    else if (/weak|cold|struggling|fade/i.test(supporting + form)) modelProb = 0.46;
  }

  const sport = String(ctx.sport || "").toUpperCase();
  const situational = String(ctx.situational || "");
  const form = String(ctx.form || "");
  const missing = String(ctx.missing || "");

  if (ctx.isHome && (gap == null || gap > 0)) {
    modelProb += 0.02 * (weights.homeAway / 0.1);
  }

  if (sport === "NBA" || sport === "NHL") {
    if (/back.?to.?back|B2B|short rest/i.test(situational + form + missing)) {
      modelProb -= 0.03;
      if (!redFlags.includes("Rest concern")) redFlags.push("Rest concern");
    }
  }
  if (sport === "MLB" || sport === "KBO") {
    if (/starting pitcher|SP TBA|pitcher TBA/i.test(missing + situational)) {
      modelProb -= 0.03;
      if (!redFlags.includes("Unknown starting lineup")) redFlags.push("Unknown starting lineup");
    }
  }
  if (sport === "NHL") {
    if (/goalie TBA|starting goalie unknown/i.test(missing + situational)) {
      modelProb -= 0.03;
      if (!redFlags.includes("Unknown starting lineup")) redFlags.push("Unknown starting lineup");
    }
  }

  const media = String(ctx.media || ctx.mediaNote || "");
  if (media && /agree|backs|on\s+this|media\s+lean|tout/i.test(media)) {
    modelProb += 0.015;
  } else if (media && /fade|against|opposite/i.test(media)) {
    modelProb -= 0.02;
  }

  if (isThinSample(form + String(ctx.sampleNote || ""))) {
    modelProb = 0.5 + (modelProb - 0.5) * 0.4;
    if (!redFlags.includes("Extremely small sample")) redFlags.push("Extremely small sample");
  }
  if (redFlags.filter((f) => f !== "Missing odds").length >= 2) {
    modelProb = clamp(modelProb - 0.035, 0.4, 0.65);
  }
  if (/injury/i.test(missing + String(ctx.opposing || ""))) {
    modelProb = clamp(modelProb - 0.03, 0.4, 0.65);
  }

  return clamp(modelProb, 0.4, 0.68);
}

export function evaluateMatchup(ctx = {}) {
  const sport = (ctx.sport || "DEFAULT").toUpperCase();
  const weights = sportWeights(sport);
  const redFlags = detectRedFlags(ctx);
  const form = String(ctx.form || "");
  const situational = String(ctx.situational || "");
  const supporting = String(ctx.supporting || "");
  const opposing = String(ctx.opposing || "");
  const sampleNote = String(ctx.sampleNote || "");
  const missing = String(ctx.missing || "");
  const media = String(ctx.media || ctx.mediaNote || "");

  const hasNamed = !!(ctx.selection && ctx.selection !== "—" && ctx.game && ctx.game !== "—");

  const modelProb = computeModelProb(ctx, weights, redFlags);
  const market = runMarketIntelligence(ctx, modelProb);
  const edge = market.edge;
  const implied = market.implied;
  const oddsDisplay = market.oddsDisplay;

  let dataQuality = "Low";
  const hasForm = form.length > 8;
  const hasSupport = supporting.length > 8 || (ctx.recordGap != null && Math.abs(ctx.recordGap) >= 0.05);
  const thin = redFlags.includes("Extremely small sample");
  if (hasForm && hasSupport && !thin) dataQuality = "Medium";
  if (
    hasForm &&
    hasSupport &&
    market.available &&
    !thin &&
    redFlags.filter((f) => f !== "Missing odds").length === 0
  )
    dataQuality = "High";

  const preliminary = { modelProb, edge, redFlags, dataQuality, sport, form, situational };
  const whatIf = runWhatIfScenarios(preliminary);
  const autopsy = runPredictionAutopsy(preliminary);

  const hardCritical = redFlags.filter((f) =>
    /Injury uncertainty|Unknown starting lineup|Extremely small sample|Insufficient historical data/i.test(f)
  );

  let playLevel = "NO PLAY";
  let playEmoji = "🔴";

  if (!hasNamed) {
    playLevel = "NO PLAY";
  } else if (
    modelProb >= 0.57 &&
    market.available &&
    edge != null &&
    edge >= 3.0 &&
    dataQuality !== "Low" &&
    autopsy.survived &&
    whatIf.classification !== "FRAGILE" &&
    hardCritical.length === 0
  ) {
    playLevel = "STRONG PLAY";
    playEmoji = "🟢";
  } else if (
    modelProb >= 0.535 &&
    dataQuality !== "Low" &&
    autopsy.survived &&
    hardCritical.length === 0 &&
    (edge == null || edge >= 0.5)
  ) {
    playLevel = "LEAN";
    playEmoji = "🟡";
  } else if (
    modelProb >= 0.55 &&
    ctx.recordGap != null &&
    Number(ctx.recordGap) >= 0.1 &&
    !thin &&
    hardCritical.length === 0
  ) {
    playLevel = "LEAN";
    playEmoji = "🟡";
  } else {
    playLevel = "NO PLAY";
    playEmoji = "🔴";
  }

  const top3 = [];
  if (ctx.recordGap != null && Number.isFinite(Number(ctx.recordGap))) {
    top3.push(
      `Record gap ${(Number(ctx.recordGap) * 100).toFixed(0)} pts win% · side ${ctx.sidePct != null ? (Number(ctx.sidePct) * 100).toFixed(0) + "%" : "—"}`
    );
  }
  if (supporting) top3.push(supporting.slice(0, 120));
  if (form) top3.push("Form: " + form.slice(0, 100));
  if (market.available && edge != null)
    top3.push("Market edge: " + (edge >= 0 ? "+" : "") + edge + "% at " + oddsDisplay);
  if (media) top3.push("Media: " + media.slice(0, 100));
  while (top3.length < 3) {
    top3.push(
      playLevel === "NO PLAY"
        ? "Insufficient verified statistical support"
        : "Best available side from current verified board"
    );
  }

  const biggestRisk =
    hardCritical[0] ||
    redFlags.find((f) => f !== "Missing odds") ||
    autopsy.topChallenge ||
    (missing ? missing.slice(0, 100) : "Unverified injuries / lineups / market depth");

  return {
    modelProb,
    probabilityPct: Math.round(modelProb * 100),
    implied,
    oddsDisplay,
    edge,
    playLevel,
    playEmoji,
    forced: false,
    dataQuality,
    redFlags,
    top3: top3.slice(0, 3),
    biggestRisk,
    autopsySurvived: autopsy.survived,
    autopsyVerdict: autopsy.verdict,
    autopsySeverity: autopsy.severity,
    autopsy,
    marketSignal: market.signalBlock,
    marketInterpretation: market.interpretation,
    marketValueAssessment: market.valueAssessment,
    whatIfClassification: whatIf.classification,
    whatIfNote: whatIf.note,
    whatIfBlock: whatIf.block,
    confidence: dataQuality === "High" ? "HIGH" : dataQuality === "Medium" ? "MEDIUM" : "LOW",
    form: form.slice(0, 200),
    situational: situational.slice(0, 200),
    projection: playLevel + " on " + (ctx.selection || "—") + " @ " + oddsDisplay,
    createdAt: new Date().toISOString(),
    lastVerified: new Date().toISOString(),
    dataStatus: market.available
      ? "ESPN stats + odds"
      : media
        ? "ESPN stats + media signal"
        : "ESPN stats only"
  };
}

export function scoreConfidence() {
  return { level: "MEDIUM" };
}
export function buildEvidenceAnalysis(ctx) {
  return evaluateMatchup(ctx);
}
export function stressTestPick(ctx) {
  const ev = evaluateMatchup(ctx);
  return { survived: ev.autopsySurvived, classification: ev.whatIfClassification, ev };
}
export function formatAnalysisDiscord(r) {
  if (!r) return "No analysis.";
  return [
    r.playEmoji + " " + r.playLevel,
    "Model: " + r.probabilityPct + "% · Edge: " + (r.edge != null ? r.edge + "%" : "n/a"),
    "Data: " + r.dataQuality + " · " + (r.dataStatus || "")
  ].join("\n");
}
export const ANALYTICS_FOOTER =
  "EDGE PLAY · stats + market + media when available · NO PLAY when thin · 21+";
