/** Standardized pick card — every lock/pick */
export function parseOddsToImplied(price) {
  if (price == null || price === "—" || price === "")
    return { implied: null, oddsDisplay: "—", source: "none" };
  const s = String(price).trim();
  const cent = s.match(/(\d{1,3})\s*¢/);
  if (cent) {
    const c = Math.min(99, Math.max(1, Number(cent[1])));
    return { implied: c / 100, oddsDisplay: c + "¢ Kalshi", source: "kalshi_cent" };
  }
  const am = s.match(/([+-]?\d{3,4})/);
  if (am) {
    const n = Number(am[1]);
    const implied = n > 0 ? 100 / (n + 100) : Math.abs(n) / (Math.abs(n) + 100);
    return { implied, oddsDisplay: n > 0 ? "+" + n : String(n), source: "american" };
  }
  const band = s.match(/(\d{1,3})\s*[–-]\s*(\d{1,3})\s*¢/);
  if (band) {
    const mid = (Number(band[1]) + Number(band[2])) / 2;
    return { implied: mid / 100, oddsDisplay: band[1] + "–" + band[2] + "¢ band", source: "kalshi_band" };
  }
  return { implied: null, oddsDisplay: s.slice(0, 40), source: "unparsed" };
}

export function estimateModelProb(tier, sport, hasNamedGame) {
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

export function standardizePick(p, { lotd = false, dataFreshness = null } = {}) {
  if (!p) {
    return { noPick: true, reason: "No pick object", finalLine: "🚫 FINAL PICK: NO PICK\nREASON: Missing pick data." };
  }
  const selection = (p.selection || p.pick || "").replace(/^👑\s*LOCK OF THE DAY\s*·\s*/i, "").trim();
  const game = p.game || p.match || p.event || "—";
  const sport = p.sport || "—";
  const tier = (p.tier || "LEAN").toUpperCase();
  const price = p.price || p.priceGuide || "—";
  const units = p.units ?? 0;
  if (!selection || /process side|soft-side|confirmed sp side|lineup-confirmed|wait sp|board scan|shop day|no forced/i.test(selection)) {
    return { noPick: true, reason: "Not a specific named pick", finalLine: "🚫 FINAL PICK: NO PICK\nREASON: No specific team/player market — run `/daily`." };
  }
  if (p.final || /FINAL|Postponed| — OFF| — FINAL/i.test(game + selection)) {
    return { noPick: true, reason: "Final or postponed", finalLine: "🚫 FINAL PICK: NO PICK\nREASON: Game is final or postponed." };
  }
  const { implied, oddsDisplay } = parseOddsToImplied(price);
  const hasNamed = !!(game && game !== "—" && selection);
  const modelProb = estimateModelProb(tier, sport, hasNamed);
  const edge = modelProb != null && implied != null ? modelProb - implied : null;
  const r = p.reasoning || p.analysis || {};
  const confLevel = r.confidence || (tier === "LOCK" || tier === "VALUE" ? "MEDIUM" : "LOW");
  const sampleThin = /small|thin|one week|postponed/i.test((r.sampleNote || r.form || "") + game);
  const risk = riskFromEdge(edge, confLevel, sampleThin);
  const confPct = confidencePct(modelProb, confLevel);
  const freshness = dataFreshness || (p.live ? "LIVE board status (ESPN public)" : "Latest ESPN schedule pull — not a live odds feed");
  const whyList = [r.form, r.situational, r.number, r.supporting, r.decision].filter(Boolean);
  const risks = [r.kill, r.stressFail, r.opposing, r.bothSides, r.missing].filter(Boolean).slice(0, 4);
  const finalLine =
    modelProb == null
      ? "🚫 FINAL PICK: NO PICK\nREASON: Insufficient model inputs for " + selection + "."
      : "🎯 FINAL PICK: " + selection + "\n📊 MODEL PROBABILITY: " + confPct + "%\n💰 ODDS: " + oddsDisplay + "\n📈 EDGE: " + (edge != null ? (edge >= 0 ? "+" : "") + (edge * 100).toFixed(1) + "%" : "n/a") + "\n⚠️ RISK: " + risk;
  return {
    noPick: false, sport, game, selection, pickLine: "PICK: " + selection, tier, units,
    confidencePct: confPct, confidenceLevel: confLevel, oddsDisplay,
    impliedProb: implied != null ? Math.round(implied * 1000) / 10 : null,
    modelProb: modelProb != null ? Math.round(modelProb * 1000) / 10 : null,
    edge: edge != null ? Math.round(edge * 1000) / 10 : null,
    risk, dataFreshness: freshness,
    analysis: r.projection || r.decision || p.why || "Process rank on named ESPN game.",
    keyStats: [r.form && "Form/context: " + r.form, r.situational && "Spot: " + r.situational, r.facts && "Facts: " + r.facts].filter(Boolean),
    whyThis: whyList.slice(0, 5),
    risks: risks.length ? risks : ["Injury / lineup change", "Closing line moves against you"],
    finalLine, reasoning: r
  };
}

export function formatStandardDiscord(std, { compact = false } = {}) {
  if (!std || std.noPick) return (std && std.finalLine) || "🚫 FINAL PICK: NO PICK\nREASON: Insufficient reliable data.";
  if (compact) {
    return "🏆 **" + std.pickLine + "**\n📊 Conf **" + (std.confidencePct ?? "—") + "%** · 💰 " + std.oddsDisplay + " · 📈 Edge " + (std.edge != null ? (std.edge >= 0 ? "+" : "") + std.edge + "%" : "n/a") + " · 🔥 " + std.risk + "\n🎯 **" + std.selection + "** · " + std.units + "u";
  }
  return [
    "🏆 **" + std.pickLine + "**",
    "📊 **CONFIDENCE:** " + (std.confidencePct ?? "—") + "% (" + std.confidenceLevel + ")",
    "💰 **ODDS:** " + std.oddsDisplay,
    "📈 **IMPLIED PROB:** " + (std.impliedProb != null ? std.impliedProb + "%" : "n/a"),
    "📊 **MODEL PROB:** " + (std.modelProb != null ? std.modelProb + "%" : "n/a"),
    "📉 **EDGE:** " + (std.edge != null ? (std.edge >= 0 ? "+" : "") + std.edge + "%" : "n/a"),
    "🔥 **RISK:** " + std.risk,
    "⏱️ **DATA:** " + std.dataFreshness,
    "",
    "**ANALYSIS**", std.analysis,
    "",
    "**KEY STATS**",
    ...(std.keyStats.length ? std.keyStats.map((s) => "• " + s) : ["• Board matchup only"]),
    "",
    "**WHY THIS PICK**",
    ...std.whyThis.slice(0, 5).map((s, i) => i + 1 + ". " + s),
    "",
    "**RISKS**",
    ...std.risks.map((s) => "• " + s),
    "", std.finalLine
  ].join("\n");
}

export function formatParlayDiscord(legs) {
  if (!legs?.length) return "🚫 FINAL PICK: NO PICK\nREASON: No valid legs.";
  const parts = legs.map((L, i) => {
    const std = standardizePick(L);
    if (std.noPick) return "**Leg " + (i + 1) + ":** NO PICK — " + std.reason;
    return "**Leg " + (i + 1) + ": " + std.selection + "** — model " + std.modelProb + "% · edge " + (std.edge != null ? std.edge + "%" : "n/a") + "\n_" + std.analysis + "_";
  });
  const probs = legs.map((L) => standardizePick(L).modelProb).filter((x) => x != null).map((x) => x / 100);
  const combined = probs.length ? probs.reduce((a, b) => a * b, 1) : null;
  return parts.join("\n\n") + "\n\n**Combined est. probability:** " + (combined != null ? (combined * 100).toFixed(1) + "%" : "n/a") + "\n_Combining legs increases uncertainty._";
}
