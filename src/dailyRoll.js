/**
 * Daily auto card — wires dailyEngine into desk state
 * Single path: pipeline → validate → desk memory → Discord consumers
 * Always surfaces best available play on LOTD / liveCard when games exist.
 */
import { runDailyPipeline, getCurrentBoard } from "./dailyEngine.js";
import { lockOfTheDay, liveCard } from "./data/desk.js";
import { validateBoard } from "./validatePublish.js";

let lastBoard = null;

function toDeskPick(p, tier) {
  return {
    selection: p.selection,
    game: p.game,
    sport: p.sport,
    tier,
    price: p.price,
    priceGuide: p.price,
    units: tier === "LOCK" ? 1 : 0.5,
    why: (p.top3 || []).join("; "),
    modelProb: p.modelProb,
    probabilityPct: p.probabilityPct,
    edge: p.edge,
    dataQuality: p.dataQuality,
    redFlags: p.redFlags || [],
    autopsySurvived: p.autopsySurvived,
    playLevel: p.playLevel,
    status: p.status,
    forced: !!p.forced,
    analysis: {
      form: p.form,
      situational: p.situational,
      supporting: (p.top3 || [])[0] || p.supporting,
      sampleNote: p.sampleNote,
      missing: p.missing
    },
    form: p.form,
    supporting: p.supporting,
    sampleNote: p.sampleNote,
    missing: p.missing,
    analyzedAt: p.analyzedAt,
    lastVerified: p.lastVerified
  };
}

function setLotd(top, stamp) {
  lockOfTheDay.sport = top.sport;
  lockOfTheDay.selection = top.selection;
  lockOfTheDay.pick = top.selection;
  lockOfTheDay.odds = top.price;
  lockOfTheDay.priceGuide = top.price;
  lockOfTheDay.units = top.tier === "LOCK" ? 1 : 0.5;
  lockOfTheDay.why = (top.top3 || []).join("; ") || (top.forced ? "Best available side on the board" : "");
  lockOfTheDay.match = top.game;
  lockOfTheDay.game = top.game;
  lockOfTheDay.modelProb = top.modelProb;
  lockOfTheDay.probabilityPct = top.probabilityPct;
  lockOfTheDay.edge = top.edge;
  lockOfTheDay.forced = !!top.forced;
  lockOfTheDay.analysis = {
    form: top.form,
    situational: top.situational,
    supporting: (top.top3 || [])[0],
    sampleNote: top.sampleNote,
    missing: top.missing
  };
  lockOfTheDay.date = stamp;
}

export async function rollDailyCard({ force = false } = {}) {
  try {
    const { board: raw } = await runDailyPipeline({ force });
    const { board, rejected } = validateBoard(raw);
    if (rejected.length) {
      console.warn("validateBoard rejected/downgraded:", rejected.slice(0, 8).join(" | "));
    }
    lastBoard = board;

    liveCard.dateLabel = board.stamp || "Today";
    liveCard.picks = [];
    for (const p of board.topPlays || []) {
      liveCard.picks.push(toDeskPick(p, "LOCK"));
    }
    for (const p of board.leans || []) {
      liveCard.picks.push(toDeskPick(p, p.tier === "LOCK" ? "LOCK" : "LEAN"));
    }

    const head = board.topPlays?.[0] || board.leans?.[0];
    if (head) {
      setLotd(head, board.stamp);
    } else {
      lockOfTheDay.selection = "";
      lockOfTheDay.pick = "";
      lockOfTheDay.why = "Waiting for live games on ESPN boards";
      lockOfTheDay.odds = "";
      lockOfTheDay.edge = null;
      lockOfTheDay.forced = false;
    }

    return board;
  } catch (e) {
    console.error("rollDailyCard:", e.message);
    return {
      noPlay: false,
      emptyBoard: true,
      text: "📡 Scan failed — " + e.message + "\nWill retry on next schedule or /scan.",
      error: e.message,
      topPlays: [],
      leans: []
    };
  }
}

export async function ensureTodayCard() {
  const board = getCurrentBoard();
  if (board && !board.stale) {
    if (!liveCard.picks?.length && (board.topPlays?.length || board.leans?.length)) {
      liveCard.dateLabel = board.stamp || "Today";
      liveCard.picks = [
        ...(board.topPlays || []).map((p) => toDeskPick(p, "LOCK")),
        ...(board.leans || []).map((p) => toDeskPick(p, "LEAN"))
      ];
      const head = board.topPlays?.[0] || board.leans?.[0];
      if (head) setLotd(head, board.stamp);
    }
    return board;
  }
  return rollDailyCard({ force: true });
}

export function getLastBoard() {
  return lastBoard || getCurrentBoard();
}
