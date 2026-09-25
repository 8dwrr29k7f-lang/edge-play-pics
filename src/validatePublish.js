/**
 * Last-chance validation before predictions reach Discord.
 * Policy: full daily card with analysis. Forced leans are allowed through
 * (clearly labeled upstream). False LOCKs still downgrade. Final/postponed drop.
 */

import { parseOddsToImplied } from "./analyticsEngine.js";

const STALE_MS = 3 * 60 * 60 * 1000;

function isNamedPick(selection) {
  if (!selection || selection === "—") return false;
  if (/process side|soft-side|board scan|NO QUALIFYING|NO PLAY/i.test(selection)) return false;
  return true;
}

export function validatePick(p) {
  const reasons = [];
  if (!p) return { ok: false, reasons: ["missing pick"], pick: null };

  const selection = p.selection || p.pick || "";
  const game = p.game || p.match || "";
  const sport = p.sport || "";
  const forced = !!p.forced;

  if (!isNamedPick(selection)) reasons.push("not a named selection");
  if (!game || game === "—") reasons.push("missing event/game");
  if (!sport) reasons.push("missing sport");

  if (p.analyzedAt) {
    const age = Date.now() - new Date(p.analyzedAt).getTime();
    if (age > STALE_MS) reasons.push("analysis older than 3h");
  }
  if (p.stale) reasons.push("marked stale");

  const modelProb =
    p.modelProb != null
      ? Number(p.modelProb) > 1
        ? Number(p.modelProb) / 100
        : Number(p.modelProb)
      : p.probabilityPct != null
        ? Number(p.probabilityPct) / 100
        : null;

  const price = p.price || p.priceGuide || p.odds;
  const parsed = parseOddsToImplied(price);
  if (modelProb != null && parsed.implied != null && p.edge != null) {
    const expected = Math.round((modelProb - parsed.implied) * 1000) / 10;
    if (Math.abs(expected - Number(p.edge)) > 1.5) {
      reasons.push(`edge mismatch (shown ${p.edge}, expected ~${expected})`);
    }
  }

  const tier = String(p.tier || p.playLevel || "").toUpperCase();
  const isLockLabel = tier === "LOCK" || tier === "STRONG PLAY" || tier === "STRONG";
  if (isLockLabel && !forced) {
    if (modelProb != null && modelProb < 0.55) reasons.push("LOCK label with model < 55%");
    if ((p.redFlags || []).some((f) => /injury|unknown lineup|thin sample|missing odds/i.test(f))) {
      reasons.push("LOCK label with critical red flags");
    }
    if (p.autopsySurvived === false) reasons.push("LOCK label failed autopsy");
  }

  // Forced leans are intentional daily card fillers — do not treat as NO PLAY drop
  if ((tier === "NO PLAY" || p.playLevel === "NO PLAY") && !forced) {
    reasons.push("engine marked NO PLAY");
  }

  if (/final|postpon|cancel/i.test(String(p.status || "") + game + selection)) {
    reasons.push("event final or postponed");
  }

  const hardDrop = reasons.some((r) =>
    /final or postponed|not a named|missing event|engine marked NO PLAY|analysis older than 3h|marked stale/i.test(
      r
    )
  );

  let pick = { ...p };
  if (hardDrop) {
    return { ok: false, reasons, pick: null };
  }

  // Soft issues on LOCK → downgrade to LEAN (forced stays LEAN)
  if (reasons.length && isLockLabel) {
    pick.tier = "LEAN";
    pick.playLevel = "LEAN";
    pick._downgraded = true;
    pick._validationReasons = reasons;
  } else if (reasons.length) {
    // Soft issues: keep forced leans; drop only non-forced low-evidence
    if (!forced && (p.autopsySurvived === false || (p.dataQuality || "") === "Low")) {
      return { ok: false, reasons: [...reasons, "insufficient evidence"], pick: null };
    }
    pick._validationReasons = reasons;
  }

  return { ok: reasons.length === 0, reasons, pick };
}

export function validateBoard(board) {
  if (!board) {
    return {
      board: {
        noPlay: true,
        emptyBoard: true,
        text: "📡 No board data yet — run /scan.",
        topPlays: [],
        leans: []
      },
      rejected: ["empty board"]
    };
  }

  const rejected = [];
  const topPlays = [];
  const leans = [];

  for (const p of board.topPlays || []) {
    const v = validatePick(p);
    if (!v.pick) {
      rejected.push(`${p.selection || "?"}: ${v.reasons.join("; ")}`);
      continue;
    }
    if (v.pick._downgraded || v.pick.tier === "LEAN") {
      leans.push(v.pick);
      if (v.pick._downgraded)
        rejected.push(`${p.selection}: downgraded — ${v.reasons.join("; ")}`);
    } else {
      topPlays.push(v.pick);
    }
  }

  for (const p of board.leans || []) {
    const v = validatePick(p);
    if (v.pick) leans.push(v.pick);
    else rejected.push(`${p.selection || "?"}: ${v.reasons.join("; ")}`);
  }

  let text = board.text || "";
  if (rejected.length) {
    text +=
      "\n\n_Validation notes:_\n" +
      rejected
        .slice(0, 5)
        .map((r) => `• ${r}`)
        .join("\n");
  }

  const empty = topPlays.length + leans.length === 0;

  return {
    board: {
      ...board,
      topPlays,
      leans,
      noPlay: empty,
      emptyBoard: empty,
      text,
      validatedAt: new Date().toISOString()
    },
    rejected
  };
}
