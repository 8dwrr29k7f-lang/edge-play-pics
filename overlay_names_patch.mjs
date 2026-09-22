/** Named team picks: PHI ML, NYY ML, etc. + force ensureTodayCard */
import fs from "fs";
import path from "path";

const f = path.join("src", "dailyRoll.js");
if (!fs.existsSync(f)) {
  console.log("no dailyRoll");
  process.exit(0);
}
let t = fs.readFileSync(f, "utf8");

if (!t.includes("function teamsFromGame")) {
  const marker = "raw: line };";
  const idx = t.indexOf(marker);
  if (idx >= 0) {
    const at = t.indexOf("\n}", idx) + 2;
    const helper = `
function teamsFromGame(game) {
  const core = (game || "").split("·")[0].trim();
  const m = core.match(/^(.+?)\\s+@\\s+(.+)$/);
  if (m) return { away: m[1].trim(), home: m[2].trim(), label: m[1].trim() + " @ " + m[2].trim() };
  return { away: null, home: core, label: core };
}
`;
    t = t.slice(0, at) + helper + t.slice(at);
    console.log("teamsFromGame injected");
  }
}

if (!t.includes('home + " ML"') && !t.includes("${home} ML") && t.includes("function processPickFromGame")) {
  const start = t.indexOf("function processPickFromGame");
  let end = t.indexOf("\nfunction buildDefaultLotd", start);
  if (end < 0) end = t.indexOf("\nfunction applyToDesk", start);
  if (start >= 0 && end > start) {
    const fn = `
function processPickFromGame(g) {
  const teams = typeof teamsFromGame === "function" ? teamsFromGame(g.game) : { home: g.game, away: "AWAY", label: g.game };
  const home = teams.home || "HOME";
  const away = teams.away || "AWAY";
  const label = teams.label || g.game;
  const statusBit = g.status ? " · " + g.status : "";
  if (g.final || /Postponed|Delayed|Cancel/i.test((g.status || "") + (g.game || ""))) {
    return {
      sport: g.sport, tier: "PASS", game: label + statusBit,
      selection: home + " / " + away + (g.final ? " — FINAL" : " — OFF"),
      price: "—", units: 0, why: "🚫 PASS · no ticket",
      type: "ml", kalshi: true, live: false, final: !!g.final
    };
  }
  const selection = home + " ML";
  const tier = g.sport === "MLB" ? "VALUE" : "LEAN";
  const units = g.sport === "MLB" ? 0.35 : 0.25;
  return {
    sport: g.sport, tier, game: label + statusBit, selection,
    price: g.sport === "MLB" ? "40–65¢ after SP" : home + " ≤58¢ / soft number",
    units,
    why: (tier === "VALUE" ? "💎" : "➖") + " ✅ TAKE **" + selection + "** · " + label,
    reasoning: {
      form: "Named ESPN game: " + label,
      situational: "Home " + home + " vs " + away,
      number: "TAKE " + selection + " in process band",
      decision: "✅ TAKE **" + selection + "** · " + units + "u",
      kill: "Injury · bad mid · postponement"
    },
    type: "ml", kalshi: true, live: g.live, final: false
  };
}

`;
    t = t.slice(0, start) + fn + t.slice(end);
    console.log("processPick named teams injected");
  }
}

t = t.replace("const picks = games.map(processPickFromGame);", "let picks = games.map(processPickFromGame);");

if (t.includes("export async function ensureTodayCard")) {
  t = t.replace(
    /export async function ensureTodayCard\(\) \{[\s\S]*?\n\}/,
    `export async function ensureTodayCard() {
  const c = getDailyCard();
  const needsNames =
    !c?.picks?.length ||
    c.picks.every((p) =>
      /process|Confirmed SP|Soft-side|Lineup-confirmed|Wait SP|Board scan/i.test(p.selection || "")
    );
  if (needsNames) return rollDailyCard({ force: true });
  return refreshLiveFlags(c);
}`
  );
  console.log("ensureTodayCard forced for named picks");
}

fs.writeFileSync(f, t);
console.log("overlay_names_patch done — real named locks ready");
