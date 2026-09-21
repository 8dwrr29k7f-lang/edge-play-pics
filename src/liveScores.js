/** Public live scores — ESPN site API, no key */
const FEEDS = {
  mlb: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard",
  nfl: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
  nba: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",
  nhl: "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard",
  soccer: "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard"
};

async function fetchBoard(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error("ESPN " + res.status);
  return res.json();
}

function formatEvents(data, sport) {
  const events = data.events || [];
  return events.map((ev) => {
    const comp = (ev.competitions || [])[0] || {};
    const status =
      ((comp.status || {}).type || {}).shortDetail ||
      ((comp.status || {}).type || {}).description ||
      "—";
    const competitors = comp.competitors || [];
    let away = "?", home = "?", as = "", hs = "";
    for (const c of competitors) {
      const abbr = (c.team && (c.team.abbreviation || c.team.shortDisplayName)) || "?";
      const sc = c.score != null ? String(c.score) : "";
      if (c.homeAway === "away") { away = abbr; as = sc; }
      else { home = abbr; hs = sc; }
    }
    const score = as !== "" && hs !== "" ? `${as}–${hs}` : "—";
    const live = /in progress|half|quarter|period|inning/i.test(status);
    const final = /final/i.test(status);
    return {
      sport,
      line: `**${away} @ ${home}** · ${score} · ${status}`,
      status, live, final,
      name: ev.name || `${away} @ ${home}`
    };
  });
}

export async function fetchSportScores(sport = "mlb") {
  const url = FEEDS[sport] || FEEDS.mlb;
  const data = await fetchBoard(url);
  const games = formatEvents(data, sport);
  return {
    sport, games,
    lines: games.map((g) => g.line),
    liveCount: games.filter((g) => g.live).length,
    finalCount: games.filter((g) => g.final).length,
    stamp: new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })
  };
}

export async function fetchMultiScores(sports = ["mlb", "nfl"]) {
  const out = [];
  for (const s of sports) {
    try {
      const b = await fetchSportScores(s);
      out.push(b);
    } catch (e) {
      out.push({ sport: s, games: [], lines: [], error: e.message, liveCount: 0, finalCount: 0, stamp: "" });
    }
  }
  return out;
}
