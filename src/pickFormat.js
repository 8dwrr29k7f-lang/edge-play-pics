/**
 * Standardized pick card — multi-factor + Market Intelligence + What-If + Autopsy.
 * NEVER forces a LOCK. Outcomes: STRONG PLAY / LEAN / NO PLAY.
 */

import {
  evaluateMatchup,
  parseOddsToImplied
} from "./analyticsEngine.js";

export { parseOddsToImplied };

export function estimateModelProb(tier, sport, hasNamedGame) {
  if (!hasNamedGame) return null;
  const t = (tier || "").toUpperCase();
  if (t === "LOCK" || t === "CAP") return 0.58;
  if (t === "VALUE") return 0.55;
  if (t === "LEAN") return 0.53;
  return null;
}

export function standardizePick(p, { lotd = false, dataFreshness = null } = {}) {
  if (!p) {
    return { noPick: true, reason: "No pick object", finalLine: formatNoPlay("Missing pick data.") };
  }

  const selection = (p.selection || p.pick || "")
    .replace(/^👑\s*LOCK OF THE DAY\s*·\s*/i, "")
    .trim();
  const game = p.game || p.match || p.event || "—";
  const sport = p.sport || "—";
  const tier = (p.tier || "LEAN").toUpperCase();
  const price = p.price || p.priceGuide || p.odds || "—";
  const units = p.units ?? 0;

  if (
    !selection ||
    /process side|soft-side|confirmed sp side|lineup-confirmed|wait sp|board scan|shop day|no forced/i.test(selection)
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

  const reasoning = p.reasoning || p.analysis || {};
  const ctx = {
    sport, selection, game, price, tier, units,
    form: reasoning.form || p.form,
    situational: reasoning.situational || p.situational,
    supporting: reasoning.supporting || p.supporting,
    opposing: reasoning.opposing || reasoning.bothSides || p.opposing,
    bothSides: reasoning.bothSides,
    sampleNote: reasoning.sampleNote || p.sampleNote,
    missing: reasoning.missing || p.missing,
    kill: reasoning.kill || p.kill,
    facts: reasoning.facts || p.facts,
    media: reasoning.media || p.media,
    notes: p.why || p.note,
    openPrice: p.openPrice || p.openingLine || p.open || reasoning.openPrice,
    currentPrice: p.currentPrice || price,
    publicPct: p.publicPct ?? p.publicPercent ?? p.betPct ?? reasoning.publicPct,
    moneyPct: p.moneyPct ?? p.handlePct ?? reasoning.moneyPct,
    lineMove: p.lineMove || p.movement || reasoning.lineMove,
    allowNoOdds: p.allowNoOdds === true || tier === "LEAN"
  };

  const ev = evaluateMatchup(ctx);
  const noPlay = ev.playLevel === "NO PLAY";

  const autopsyLine =
    ev.autopsyVerdict || (ev.autopsySurvived ? "Survived adversarial review" : "Failed autopsy");

  const marketBlock = ev.marketSignal || [
    "📈 MARKET SIGNAL",
    "• Opening: unavailable",
    "• Current: unavailable",
    "• Movement: unavailable",
    "• Model probability: unavailable",
    "• Implied probability: unavailable",
    "• Estimated edge: unavailable",
    "• Market information not supplied — no line or public data invented."
  ].join("\n");

  const finalBlock = noPlay
    ? formatNoPlay(
        ev.autopsy && ev.autopsy.action === "FORCE_NO_PLAY"
          ? `Autopsy failed: ${ev.autopsy.topChallenge || ev.autopsyVerdict}`
          : ev.redFlags?.length
            ? `Red flags: ${ev.redFlags.slice(0, 2).join("; ")}`
            : ev.dataQuality === "Low"
              ? "Insufficient verified data coverage."
              : "Model probability / edge below threshold or failed autopsy."
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
        marketBlock,
        "",
        ev.whatIfBlock || null,
        "",
        `📊 DATA QUALITY: ${ev.dataQuality}`,
        `🔬 AUTOPSY: ${autopsyLine}`,
        "",
        "FINAL:",
        `${ev.playEmoji} ${ev.playLevel} on ${selection} at ${ev.oddsDisplay} (model ${ev.probabilityPct}%, edge ${ev.edge != null ? (ev.edge >= 0 ? "+" : "") + ev.edge + "%" : "n/a"}). Survived case-for + case-against.`
      ]
        .filter((x) => x != null)
        .join("\n");

  return {
    noPick: noPlay,
    reason: noPlay ? "Engine returned NO PLAY (model, market, or autopsy)" : null,
    sport, game, selection,
    pickLine: "PICK: " + selection,
    tier: ev.playLevel,
    units: noPlay ? 0 : units,
    confidencePct: ev.probabilityPct,
    confidenceLevel: ev.confidence,
    oddsDisplay: ev.oddsDisplay,
    impliedProb: ev.implied != null ? Math.round(ev.implied * 1000) / 10 : null,
    modelProb: Math.round(ev.modelProb * 1000) / 10,
    edge: ev.edge,
    risk: ev.redFlags?.length || (ev.autopsySeverity || 0) >= 3 ? "High" : ev.dataQuality === "High" ? "Medium" : "High",
    dataFreshness: dataFreshness || (p.live ? "LIVE board status (ESPN public)" : "Latest schedule / desk pull — not a live odds feed"),
    dataQuality: ev.dataQuality,
    playLevel: ev.playLevel,
    playEmoji: ev.playEmoji,
    analysis: ev.projection,
    whyThis: ev.top3,
    risks: [ev.biggestRisk, ...(ev.redFlags || [])].filter(Boolean).slice(0, 4),
    top3: ev.top3,
    biggestRisk: ev.biggestRisk,
    autopsyVerdict: ev.autopsyVerdict,
    autopsySeverity: ev.autopsySeverity,
    autopsySurvived: ev.autopsySurvived,
    marketSignal: ev.marketSignal,
    marketInterpretation: ev.marketInterpretation,
    marketValueAssessment: ev.marketValueAssessment,
    whatIfClassification: ev.whatIfClassification,
    whatIfNote: ev.whatIfNote,
    whatIfBlock: ev.whatIfBlock,
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
    "• Data quality, sample size, market value, or autopsy failure",
    "• Engine refuses to force a lock",
    "",
    "⚠️ BIGGEST RISK",
    `• ${reason}`,
    "",
    "📈 MARKET SIGNAL",
    "• Opening: unavailable",
    "• Current: unavailable",
    "• Movement: unavailable",
    "• Model probability: unavailable",
    "• Implied probability: unavailable",
    "• Estimated edge: unavailable",
    "• Market information not supplied — no line or public data invented.",
    "",
    "📊 DATA QUALITY: Low",
    "🔬 AUTOPSY: Failed or not applicable",
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
      `${std.playEmoji} ${std.playLevel} · ${std.units}u · DQ ${std.dataQuality}${std.whatIfClassification ? " · " + std.whatIfClassification : ""}${std.autopsySurvived === false ? " · autopsy↓" : ""}`
    ].join("\n");
  }

  return std.finalLine;
}

export function formatParlayDiscord(legs) {
  if (!legs?.length) return formatNoPlay("No valid legs.");
  const parts = legs.map((L, i) => {
    const std = standardizePick(L);
    if (std.noPick) return `**Leg ${i + 1}:** 🔴 NO PLAY — ${std.reason || "engine/autopsy reject"}`;
    return `**Leg ${i + 1}: ${std.selection}** — model ${std.modelProb}% · edge ${std.edge != null ? std.edge + "%" : "n/a"} · ${std.playEmoji} ${std.playLevel}`;
  });
  const probs = legs.map((L) => standardizePick(L).modelProb).filter((x) => x != null).map((x) => x / 100);
  const combined = probs.length ? probs.reduce((a, b) => a * b, 1) : null;
  return (
    parts.join("\n\n") +
    "\n\n**Combined est. probability:** " +
    (combined != null ? (combined * 100).toFixed(1) + "%" : "n/a") +
    "\n_Combining legs multiplies uncertainty. Prefer single plays that survived autopsy + market check._"
  );
}

export function formatPick(p) {
  return p?.selection || "—";
}

export function formatOdds(o) {
  const n = Number(o);
  if (!Number.isFinite(n)) return String(o ?? "—");
  return n > 0 ? `+${n}` : String(n);
}
