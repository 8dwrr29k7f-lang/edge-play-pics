/**
 * EDGE PLAY — Evidence-based sports analytics engine
 * Master principles: verified stats only, facts vs projection,
 * two-sided evidence, sample-size awareness, confidence from data quality,
 * stress-test before LOCK, Discord-friendly output.
 */

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

export function buildEvidenceAnalysis({
  sport, selection, game, price, units, tier,
  form, situational, number, media, kill, decision,
  facts, projection, missing, bothSides, supporting, opposing,
  sampleNote, stressFail
} = {}) {
  const conf = scoreConfidence({
    hasBoard: !!(game || sport),
    hasPrice: !!price && price !== "—",
    hasForm: !!form,
    sampleNote: sampleNote || form,
    missingHeavy: /injury report|lineup|closing/i.test(missing || "")
  });
  return {
    form: form || "Board listed — expand with last-5 / last-10 when available.",
    situational: situational || "Home/road, rest, and TV context when known.",
    number: number || price || "—",
    media: media || "IG/X/TG = public signal only. Desk sizes units via process, not tout copy.",
    kill: kill || stressFail || "Injury · line move against you · missing starter · bad mid",
    decision:
      decision ||
      (tier === "LOCK" || tier === "CAP"
        ? `🔒 ✅ TAKE ${selection || "side"} · ${units ?? 0.5}u · only at process price`
        : tier === "VALUE"
          ? `💎 ✅ TAKE ${selection || "side"} · ${units ?? 0.35}u if price hits`
          : tier === "LEAN"
            ? `➖ ✅ TAKE LEAN ${selection || "side"} · ${units ?? 0.25}u in band`
            : `⏸️ HOLD / 🚫 PASS until data clears`),
    facts: facts || `Sport ${sport || "—"} · game on auto slate when ESPN lists it.`,
    projection: projection || "Multi-factor process lean — not a guaranteed outcome.",
    missing: missing || "Full injury report, confirmed lineup, and closing number may still move.",
    confidence: conf.level,
    confidenceLine: conf.line,
    bothSides: bothSides || opposing || "If the number is outside process band or news flips, PASS.",
    supporting: supporting || form || "—",
    opposing: opposing || bothSides || "Opponent form, public steam, or small sample can reverse the lean.",
    sampleNote: sampleNote || "Weight recent form without letting one-game samples dominate.",
    stressFail: stressFail || kill || "Projection fails if key player out or mid is taxed.",
    prediction: decision || `Process call on ${selection || "side"}`,
    serve: number || price || "—"
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
  "EDGE PLAY · evidence-based · facts ≠ projection · not guaranteed · 21+";
