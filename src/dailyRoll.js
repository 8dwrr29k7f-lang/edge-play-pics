/**
 * Daily auto card — wires dailyEngine into desk state
 */
import { runDailyPipeline, getCurrentBoard } from "./dailyEngine.js";
import { lockOfTheDay, liveCard, categories } from "./data/desk.js";

let lastBoard = null;

export async function rollDailyCard({ force = false } = {}) {
  try {
    const { board, state } = await runDailyPipeline({ force });
    lastBoard = board;

    // Populate liveCard for existing embeds
    liveCard.dateLabel = board.stamp || "Today";
    liveCard.picks = [];
    for (const p of board.topPlays || []) {
      liveCard.picks.push({
        selection: p.selection,
        game: p.game,
        sport: p.sport,
        tier: "LOCK",
        price: p.price,
        priceGuide: p.price,
        units: 1,
        why: (p.top3 || []).join("; "),
        analysis: {
          form: p.form,
          situational: p.situational,
          supporting: (p.top3 || [])[0],
          sampleNote: p.sampleNote,
          missing: p.missing
        },
        analyzedAt: p.analyzedAt,
        lastVerified: p.lastVerified
      });
    }
    for (const p of board.leans || []) {
      liveCard.picks.push({
        selection: p.selection,
        game: p.game,
        sport: p.sport,
        tier: "LEAN",
        price: p.price,
        priceGuide: p.price,
        units: 0.5,
        why: (p.top3 || []).join("; "),
        analysis: {
          form: p.form,
          situational: p.situational,
          supporting: (p.top3 || [])[0],
          sampleNote: p.sampleNote,
          missing: p.missing
        },
        analyzedAt: p.analyzedAt,
        lastVerified: p.lastVerified
      });
    }

    // LOTD = first top play if any
    if (board.topPlays?.length) {
      const top = board.topPlays[0];
      lockOfTheDay.sport = top.sport;
      lockOfTheDay.selection = top.selection;
      lockOfTheDay.pick = top.selection;
      lockOfTheDay.odds = top.price;
      lockOfTheDay.priceGuide = top.price;
      lockOfTheDay.units = 1;
      lockOfTheDay.why = (top.top3 || []).join("; ");
      lockOfTheDay.match = top.game;
      lockOfTheDay.game = top.game;
      lockOfTheDay.analysis = {
        form: top.form,
        situational: top.situational,
        supporting: (top.top3 || [])[0],
        sampleNote: top.sampleNote,
        missing: top.missing
      };
      lockOfTheDay.date = board.stamp;
    } else {
      lockOfTheDay.selection = "";
      lockOfTheDay.pick = "";
      lockOfTheDay.why = "NO QUALIFYING PLAY TODAY";
    }

    return board;
  } catch (e) {
    console.error("rollDailyCard:", e.message);
    return { noPlay: true, text: "🚫 Scan failed — " + e.message, error: e.message };
  }
}

export async function ensureTodayCard() {
  const board = getCurrentBoard();
  if (board && !board.stale) return board;
  return rollDailyCard({ force: true });
}

export function getLastBoard() {
  return lastBoard || getCurrentBoard();
}
