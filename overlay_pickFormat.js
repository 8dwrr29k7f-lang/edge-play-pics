/**
 * Standardized pick card — every prediction uses the same transparent format.
 * Driven by the multi-factor analytics engine.
 * NEVER forces a LOCK. Outcomes: STRONG PLAY / LEAN / NO PLAY.
 */

import {
  evaluateMatchup,
  parseOddsToImplied,
  buildEvidenceAnalysis
} from "./analyticsEngine.js";

export { parseOddsToImplied };

export function estimateModelProb(tier, sport, hasNamedGame) {
  // Legacy fallback only — real model lives in evaluateMatchup
  if (!hasNamedGame) return null;
  const t = (tier || "").toUpperCase();
  if (t === "LOCK" || t === "CAP") return 0.58;
  if (t === "VALUE") return 0.55;
  if (t === "LEAN") return 0.53;
  return null;
}

export function riskFromEdge(edge, confLevel, sampleThin) {
  if (sampleThin || confLevel === "LOW") return "High";
  if (edge != null && edge >= 0.04 && confLevel === "HIGH") return "Low";
  if (edge != null && edge >= 0.02) return "Medium";
  if (edge != null && edge < 0) return "High";
  return confLevel === "HIGH" ? "Medium" : confLevel === "LOW" ? "High" : "Medium";
}

export function confidencePct(modelProb, confLevel) {
  if (modelProb == null) return null;
  let pct = Math.round(modelProb * 100);
  if (confLevel === "LOW") pct = Math.min(pct, 52);
  if (confLevel === "HIGH") pct = Math.min(62, Math.max(pct, 56));
  return pct;
}

/**
 * Core standardization — runs the full multi-factor engine.
 */
export function standardizePick(p, { lotd = false, dataFreshness = null } = {}) {
  if (!p) {
    return {
      noPick: true,
      reason: "No pick object",
      finalLine: formatNoPlay("Missing pick data.")
    };
  }

  const selection = (p.selection || p.pick || "")
    .replace(/^👑\s*LOCK OF THE DAY\s*·\s*/i, "")
    .trim();
  const game = p.game || p.match || p.event || "—";
  const sport = p.sport || "—";
  const tier = (p.tier || "LEAN").toUpperCase();
  const price = p.price || p.priceGuide || p.odds || "—";
  const units = p.units ?? 0;

  // Hard rejects before engine
  if (
    !selection ||
    /process side|soft-side|confirmed sp side|lineup-confirmed|wait sp|board scan|shop day|no forced/i.test(
      selection
    )
  ) {
    return {
      noPick: true,
      reason: "Not a specific named pick",
      finalLine: formatNoPlay("No specific team/player market — run `/daily`.")
    };
  }
  if (p.final || /FINAL|Postponed| — OFF| — FINAL/i.test(game + selection)) {
    return {
      noPick: true,
      reason: "Final or postponed",
      finalLine: formatNoPlay("Game is final or postponed.")
    };
  }

  // Build context for the engine from whatever the desk supplies
  const reasoning = p.reasoning || p.analysis || {};
  const ctx = {
    sport,
    selection,
    game,
    price,
    tier,
    units,
    form: reasoning.form || p.form,
    situational: reasoning.situational || p.situational,
    supporting: reasoning.supporting || p.supporting,
    opposing: reasoning.opposing || reasoning.bothSides || p.opposing,
    bothSides: reasoning.bothSides,
    sampleNote: reasoning.sampleNote || p.sampleNote,
    missing: reasoning.missing || p.missing,
    kill: reasoning.kill || p.kill,
    stressFail: reasoning.stressFail,
    facts: reasoning.facts || p.facts,
    media: reasoning.media || p.media,
    notes: p.why || p.note,
    signals: p.signals || reasoning.signals,
    allowNoOdds: false
  };

  const ev = evaluateMatchup(ctx);

  // Map engine output → standardized card
  const noPlay = ev.playLevel === "NO PLAY";

  const finalBlock = noPlay
    ? formatNoPlay(
        ev.redFlags.length
          ? `Red flags: ${ev.redFlags.slice(0, 2).join("; ")}`
          : ev.dataQuality === "Low"
            ? "Insufficient verified data coverage."
            : "Model probability / edge below threshold for a play."
      )
    : [
        "━━━━━━━━━━━━━━━━",
        `🎯 PICK: ${selection}`,
        `📊 PROBABILITY: ${ev.probabilityPct}%`,
        `💰 ODDS: ${ev.oddsDisplay}`,
        `📈 EDGE: ${ev.edge != null ? (ev.edge >= 0 ? "+" : "") + ev.edge + "%" : "n/a"}`,
        `${ev.playEmoji} PLAY LEVEL: ${ev.playLevel}`,
        "━━━━━━━━━━━━━━━━",
        "",
        "🔥 TOP 3 REASONS",
        `• ${ev.top3[0]}`,
        `• ${ev.top3[1]}`,
        `• ${ev.top3[2]}`,
        "",
        "⚠️ BIGGEST RISK",
        `• ${ev.biggestRisk}`,
        "",
        `📊 DATA QUALITY: ${ev.dataQuality}`,
        ev.modelAgreement ? `🤖 MODEL AGREEMENT: ${ev.modelAgreement}` : null,
        "",
        "FINAL:",
        noPlay
          ? `No actionable edge on ${selection} — pass.`
          : `${ev.playEmoji} ${ev.playLevel} on ${selection} at ${ev.oddsDisplay} (model ${ev.probabilityPct}%, edge ${ev.edge != null ? (ev.edge >= 0 ? "+" : "") + ev.edge + "%" : "n/a"}).`
      ]
        .filter((x) => x != null)
        .join("\n");

  const freshness =
    dataFreshness ||
    (p.live ? "LIVE board status (ESPN public)" : "Latest schedule / desk pull — not a live odds feed");

  return {
    noPick: noPlay,
    reason: noPlay ? "Engine returned NO PLAY" : null,
    sport,
    game,
    selection,
    pickLine: "PICK: " + selection,
    tier: ev.playLevel, // override legacy LOCK with honest level
    units: noPlay ? 0 : units,
    confidencePct: ev.probabilityPct,
    confidenceLevel: ev.confidence,
    oddsDisplay: ev.oddsDisplay,
    impliedProb: ev.implied != null ? Math.round(ev.implied * 1000) / 10 : null,
    modelProb: Math.round(ev.modelProb * 1000) / 10,
    edge: ev.edge,
    risk: ev.redFlags.length ? "High" : ev.dataQuality === "High" ? "Medium" : "High",
    dataFreshness: freshness,
    dataQuality: ev.dataQuality,
    playLevel: ev.playLevel,
    playEmoji: ev.playEmoji,
    analysis: ev.projection,
    keyStats: [
      ev.form && "Form: " + ev.form,
      ev.situational && "Spot: " + ev.situational,
      ev.facts && "Facts: " + ev.facts
    ].filter(Boolean),
    whyThis: ev.top3,
    risks: [ev.biggestRisk, ...(ev.redFlags || [])].filter(Boolean).slice(0, 4),
    top3: ev.top3,
    biggestRisk: ev.biggestRisk,
    modelAgreement: ev.modelAgreement,
    redFlags: ev.redFlags,
    finalLine: finalBlock,
    reasoning: ev
  };
}

function formatNoPlay(reason) {
  return [
    "━━━━━━━━━━━━━━━━",
    "🎯 PICK: —",
    "📊 PROBABILITY: —",
    "💰 ODDS: —",
    "📈 EDGE: —",
    "🔴 PLAY LEVEL: NO PLAY",
    "━━━━━━━━━━━━━━━━",
    "",
    "🔥 TOP 3 REASONS",
    "• Insufficient verified statistical support",
    "• Data quality or sample size inadequate",
    "• Engine refuses to force a lock",
    "",
    "⚠️ BIGGEST RISK",
    `• ${reason}`,
    "",
    "📊 DATA QUALITY: Low",
    "",
    "FINAL:",
    `No play — ${reason}`
  ].join("\n");
}

export function formatStandardDiscord(std, { compact = false } = {}) {
  if (!std) return formatNoPlay("Insufficient reliable data.");
  if (std.noPick) return std.finalLine || formatNoPlay(std.reason || "Insufficient reliable data.");

  if (compact) {
    return [
      `${std.playEmoji || "🎯"} **${std.selection}**`,
      `📊 ${std.confidencePct ?? "—"}% · 💰 ${std.oddsDisplay} · 📈 ${std.edge != null ? (std.edge >= 0 ? "+" : "") + std.edge + "%" : "n/a"}`,
      `${std.playEmoji} ${std.playLevel} · ${std.units}u · DQ ${std.dataQuality}`
    ].join("\n");
  }

  // Full card already built by standardizePick
  return std.finalLine;
}

export function formatParlayDiscord(legs) {
  if (!legs?.length) return formatNoPlay("No valid legs.");
  const parts = legs.map((L, i) => {
    const std = standardizePick(L);
    if (std.noPick) return `**Leg ${i + 1}:** 🔴 NO PLAY — ${std.reason || "engine reject"}`;
    return `**Leg ${i + 1}: ${std.selection}** — model ${std.modelProb}% · edge ${std.edge != null ? std.edge + "%" : "n/a"} · ${std.playEmoji} ${std.playLevel}`;
  });
  const probs = legs
    .map((L) => standardizePick(L).modelProb)
    .filter((x) => x != null)
    .map((x) => x / 100);
  const combined = probs.length ? probs.reduce((a, b) => a * b, 1) : null;
  return (
    parts.join("\n\n") +
    "\n\n**Combined est. probability:** " +
    (combined != null ? (combined * 100).toFixed(1) + "%" : "n/a") +
    "\n_Combining legs multiplies uncertainty. Prefer single plays._"
  );
}
