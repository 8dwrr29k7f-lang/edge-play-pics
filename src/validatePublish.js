/**
 * Last-chance validation before any prediction reaches Discord.
 * If a critical check fails → force NO PLAY / strip LOCK label.
 * Never invents data; only rejects inconsistent or unsafe output.
 */

import { parseOddsToImplied } from "./analyticsEngine.js";

const STALE_MS = 3 * 60 * 60 * 1000;

function isNamedPick(selection) {
  if (!selection || selection === "—") return false;
  if (/process side|soft-side|board scan|no forced|NO QUALIFYING/i.test(selection)) return false;
  return true;
}

/**
 * Validate a single pick object (from engine / liveCard).
 * @returns {{ ok: boolean, reasons: string[], pick: object }}
 */
export function validatePick(p) {
  const reasons = [];
  if (!p) return { ok: false, reasons: ["missing pick"], pick: null };

  const selection = p.selection || p.pick || "";
  const game = p.game || p.match || "";
  const sport = p.sport || "";

  if (!isNamedPick(selection)) reasons.push("not a named selection");
  if (!game || game === "—") reasons.push("missing event/game");
  if (!sport) reasons.push("missing sport");

  // Stale
  if (p.analyzedAt) {
    const age = Date.now() - new Date(p.analyzedAt).getTime();
    if (age > STALE_MS) reasons.push("analysis older than 3h");
  }
  if (p.stale) reasons.push("marked stale");

  // Probability / edge consistency when both present
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

  // LOCK without evidence → downgrade path
  const tier = String(p.tier || p.playLevel || "").toUpperCase();
  const isLockLabel = tier === "LOCK" || tier === "STRONG PLAY" || tier === "STRONG";
  if (isLockLabel) {
    if (modelProb != null && modelProb < 0.55) reasons.push("LOCK label with model < 55%");
    if ((p.redFlags || []).some((f) => /injury|unknown lineup|thin sample|missing odds/i.test(f))) {
      reasons.push("LOCK label with critical red flags");
    }
    if (p.autopsySurvived === false) reasons.push("LOCK label failed autopsy");
  }

  // Final / postponed
  if (/final|postpon|cancel/i.test(String(p.status || "") + game + selection)) {
    reasons.push("event final or postponed");
  }

  const ok = reasons.length === 0;
  let pick = { ...p };
  if (!ok && isLockLabel) {
    // Downgrade rather than publish false LOCK
    pick.tier = "LEAN";
    pick.playLevel = "LEAN";
    pick._downgraded = true;
    pick._validationReasons = reasons;
  }
  if (!ok && reasons.some((r) => /final or postponed|not a named|missing event/i.test(r))) {
    pick = null;
  }

  return { ok, reasons, pick };
}

/**
 * Validate full board before Discord post.
 * Strips invalid picks; may flip noPlay.
 */
export function validateBoard(board) {
  if (!board) {
    return {
      board: {
        noPlay: true,
        text: "🚫 NO QUALIFYING PLAY — validation failed (empty board).",
        topPlays: [],
        leans: []
      },
      rejected: ["empty board"]
    };
  }

  const rejected = [];
  const topPlays = [];
  for (const p of board.topPlays || []) {
    const v = validatePick(p);
    if (v.pick && (v.ok || v.pick._downgraded)) {
      if (v.pick._downgraded) {
        rejected.push(`${p.selection}: downgraded — ${v.reasons.join("; ")}`);
        // moved to leans conceptually
      } else {
        topPlays.push(v.pick);
      }
    } else {
      rejected.push(`${p.selection || "?"}: ${v.reasons.join("; ")}`);
    }
  }

  const leans = [];
  for (const p of board.leans || []) {
    const v = validatePick(p);
    if (v.pick) leans.push(v.pick);
    else rejected.push(`${p.selection || "?"}: ${v.reasons.join("; ")}`);
  }

  // Collect downgraded locks into leans
  for (const p of board.topPlays || []) {
    const v = validatePick(p);
    if (v.pick?._downgraded) leans.push(v.pick);
  }

  const noPlay = topPlays.length + leans.length === 0;
  let text = board.text || "";
  if (noPlay && !board.noPlay) {
    text =
      "🚫 NO QUALIFYING PLAY TODAY\n" +
      "Validation gate removed all candidates (stale, inconsistent, or insufficient evidence).\n" +
      (rejected.length ? rejected.slice(0, 5).map((r) => `• ${r}`).join("\n") : "");
  }
  if (rejected.length && !noPlay) {
    text += "\n\n_Validation notes:_\n" + rejected.slice(0, 5).map((r) => `• ${r}`).join("\n");
  }

  return {
    board: {
      ...board,
      topPlays,
      leans,
      noPlay,
      text,
      validatedAt: new Date().toISOString()
    },
    rejected
  };
}
