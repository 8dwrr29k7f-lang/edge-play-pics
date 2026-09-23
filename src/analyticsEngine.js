/**
 * EDGE PLAY — Evidence-based multi-factor decision engine (v9)
 *
 * POLICY: Always return a playable side when a named selection exists.
 * LOCK only when strict thresholds pass; otherwise LEAN (possibly forced).
 * NO PLAY is reserved only for missing/invalid selection identity.
 */

function safeNum(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

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
  { re: /no odds|odds unavailable|missing price/i, flag: "Missing odds" },
  { re: /line move|steam|reverse line movement|sharp money/i, flag: "Large market movement" },
  { re: /outdated|stale data|last updated.*(yesterday|hours ago)/i, flag: "Outdated information" },
  { re: /unusual matchup|first meeting|no H2H/i, flag: "Unusual / limited matchup history" },
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

export function runMarketIntelligence(ctx = {}, modelProb = null) {
  const openRaw = ctx.openPrice || ctx.openingLine || ctx.open || ctx.oddsOpen || null;
  const currentRaw = ctx.price || ctx.currentPrice || ctx.odds || ctx.priceGuide || null;
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
  if (modelProb != null && implied != null) edge = Math.round((modelProb - implied) * 1000) / 10;
  let interpretation = !hasAnyMarket
    ? "Market information unavailable — model stands alone."
    : "Current price observed; limited movement/public context.";
  let valueAssessment =
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
    "• Movement: unavailable",
    "• Model probability: " + (modelProb != null ? Math.round(modelProb * 100) + "%" : "unavailable"),
    "• Implied probability: " + (implied != null ? Math.round(implied * 100) + "%" : "unavailable"),
    "• Estimated edge: " + (edge != null ? (edge >= 0 ? "+" : "") + edge + "%" : "unavailable"),
    "• Value read: " + valueAssessment
  ].join("\n");
  return {
    available: hasAnyMarket,
    opening: hasOpen ? openParsed.oddsDisplay : null,
    current: hasCurrent ? currentParsed.oddsDisplay : null,
    oddsDisplay,
    implied,
    edge,
    interpretation,
    valueAssessment,
    signalBlock,
    modelProb: modelProb != null ? Math.round(modelProb * 1000) / 10 : null,
    impliedProbPct: implied != null ? Math.round(implied * 100) : null
  };
}

export function runWhatIfScenarios(preliminary, ctx = {}) {
  const baseProb = preliminary.modelProb ?? 0.5;
  const scenarios = [];
  function shock(name, delta) {
    const newProb = clamp(baseProb + delta, 0.35, 0.78);
    scenarios.push({
      name,
      ran: true,
      newProb: Math.round(newProb * 1000) / 10,
      directionHeld: (baseProb >= 0.5 && newProb >= 0.5) || (baseProb < 0.5 && newProb < 0.5),
      stillPlayable: newProb >= 0.5
    });
  }
  shock("Key player limited", -0.05);
  shock("Starter scratched", -0.07);
  shock("Lineup change", -0.04);
  const fragile = scenarios.filter((s) => s.ran && !s.stillPlayable).length >= 2;
  const sensitive = scenarios.filter((s) => s.ran && !s.directionHeld).length >= 1;
  const classification = fragile ? "FRAGILE" : sensitive ? "SENSITIVE" : "ROBUST";
  return {
    classification,
    scenarios,
    note:
      classification === "FRAGILE"
        ? "Pick is fragile under stress — still published as LEAN if forced."
        : classification === "SENSITIVE"
          ? "Pick direction can flip under stress."
          : "Pick holds under standard stress tests.",
    block:
      "🔬 WHAT-IF: " +
      classification +
      " — " +
      (classification === "FRAGILE"
        ? "Fragile under stress"
        : classification === "SENSITIVE"
          ? "Sensitive to key assumptions"
          : "Holds under stress")
  };
}

export function runPredictionAutopsy(preliminary, ctx = {}) {
  const challenges = [];
  const redFlags = preliminary.redFlags || [];
  if (redFlags.includes("Missing odds")) challenges.push("No market price — cannot validate value");
  if (redFlags.includes("Extremely small sample")) challenges.push("Sample thin");
  if (redFlags.includes("Injury uncertainty")) challenges.push("Injury status unresolved");
  if (redFlags.includes("Unknown starting lineup")) challenges.push("Starting lineup not confirmed");
  if ((preliminary.modelProb || 0) < 0.53) challenges.push("Model probability below ideal LEAN bar");
  if (preliminary.edge != null && preliminary.edge < 1) challenges.push("Edge below ideal minimum");
  if ((preliminary.dataQuality || "Low") === "Low") challenges.push("Data quality low");
  const severity = challenges.length;
  // Autopsy no longer hard-blocks LEAN — only informs LOCK eligibility
  const survived = severity < 3 && (preliminary.modelProb || 0) >= 0.52;
  return {
    challenges,
    topChallenge: challenges[0] || "No critical autopsy failure",
    severity,
    survived,
    action: survived ? "PASS" : "DOWNGRADE_TO_LEAN",
    verdict: survived
      ? "Survived adversarial review"
      : "Weak autopsy — publish as LEAN only: " + (challenges[0] || "thin evidence")
  };
}

export function evaluateMatchup(ctx = {}) {
  const sport = (ctx.sport || "DEFAULT").toUpperCase();
  const redFlags = detectRedFlags(ctx);
  const form = String(ctx.form || "");
  const situational = String(ctx.situational || "");
  const supporting = String(ctx.supporting || "");
  const opposing = String(ctx.opposing || "");
  const sampleNote = String(ctx.sampleNote || "");
  const missing = String(ctx.missing || "");

  let modelProb = 0.5;
  if (/stronger season record|holds stronger|clear edge|elite form|dominant/i.test(supporting + form))
    modelProb = 0.58;
  else if (/close season records|limited edge|close records/i.test(supporting + form))
    modelProb = 0.52;
  else if (/weak|cold|struggling|fade/i.test(supporting + form)) modelProb = 0.46;

  if (isThinSample(form + sampleNote) || /thin sample/i.test(sampleNote)) {
    modelProb = 0.5 + (modelProb - 0.5) * 0.4;
    if (!redFlags.includes("Extremely small sample")) redFlags.push("Extremely small sample");
  }
  if (redFlags.length >= 2) modelProb = clamp(modelProb - 0.04, 0.42, 0.65);
  if (/injury|lineup not|missing/i.test(missing + opposing))
    modelProb = clamp(modelProb - 0.03, 0.42, 0.65);

  modelProb = clamp(modelProb, 0.42, 0.68);

  const market = runMarketIntelligence(ctx, modelProb);
  const edge = market.edge;
  const implied = market.implied;
  const oddsDisplay = market.oddsDisplay;

  let dataQuality = "Low";
  const hasForm = form.length > 10;
  const hasSit = situational.length > 10;
  const hasSupport = supporting.length > 10;
  const availableCount = [hasForm, hasSit, hasSupport, market.available].filter(Boolean).length;
  if (availableCount >= 3 && !redFlags.includes("Extremely small sample")) dataQuality = "Medium";
  if (availableCount >= 3 && market.available && redFlags.length === 0) dataQuality = "High";

  const preliminary = { modelProb, edge, redFlags, dataQuality, sport, form, situational };
  const whatIf = runWhatIfScenarios(preliminary, ctx);
  const autopsy = runPredictionAutopsy({ ...preliminary, edge }, ctx);

  const hasNamed = !!(ctx.selection && ctx.selection !== "—" && ctx.game && ctx.game !== "—");

  // LOCK only when strict gates pass
  let playLevel = "LEAN";
  let playEmoji = "🟡";
  let forced = false;

  if (!hasNamed) {
    playLevel = "NO PLAY";
    playEmoji = "🔴";
  } else if (
    modelProb >= 0.57 &&
    (edge == null || edge >= 3.5) &&
    dataQuality !== "Low" &&
    autopsy.survived &&
    whatIf.classification !== "FRAGILE" &&
    !redFlags.some((f) => /Injury uncertainty|Unknown starting lineup|Extremely small sample|Missing odds/i.test(f))
  ) {
    playLevel = "STRONG PLAY";
    playEmoji = "🟢";
  } else if (modelProb >= 0.53 && (edge == null || edge >= 1.0) && dataQuality !== "Low") {
    playLevel = "LEAN";
    playEmoji = "🟡";
  } else {
    // Force LEAN — always publish a side when named
    playLevel = "LEAN";
    playEmoji = "🟡";
    forced = true;
    if (!redFlags.includes("Forced play — thin evidence"))
      redFlags.push("Forced play — thin evidence");
  }

  const top3 = [];
  if (supporting) top3.push(supporting.slice(0, 120));
  if (form) top3.push("Form/records: " + form.slice(0, 100));
  if (market.available && edge != null)
    top3.push("Market edge: " + (edge >= 0 ? "+" : "") + edge + "% at " + oddsDisplay);
  while (top3.length < 3)
    top3.push(
      top3.length === 0
        ? "Best available side from current board"
        : "Data gaps remain on injuries/lineups/market depth"
    );

  const biggestRisk =
    redFlags[0] ||
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
    forced,
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
    projection: playLevel + " on " + (ctx.selection || "—") + " @ " + oddsDisplay
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
    r.playEmoji + " " + r.playLevel + (r.forced ? " (forced)" : ""),
    "Model: " + r.probabilityPct + "% · Edge: " + (r.edge != null ? r.edge + "%" : "n/a"),
    "Data: " + r.dataQuality,
    r.autopsyVerdict ? "Autopsy: " + r.autopsyVerdict : null
  ]
    .filter(Boolean)
    .join("\n");
}

export const ANALYTICS_FOOTER =
  "EDGE PLAY · always publishes best available play · LOCK only when evidence is strong · 21+";
