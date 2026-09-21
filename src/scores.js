import { fetchSportScores } from "./liveScores.js";

export async function fetchMlbScores() {
  const b = await fetchSportScores("mlb");
  return {
    lines: b.lines,
    status: `${b.games.length} games · ESPN · ${b.stamp} CT · live ${b.liveCount} · final ${b.finalCount}`
  };
}
