/** Force clear LOCK OF THE DAY from best ranked pick */
import fs from "fs";
import path from "path";

const f = path.join("src", "dailyRoll.js");
if (!fs.existsSync(f)) {
  console.log("no dailyRoll to patch");
  process.exit(0);
}
let t = fs.readFileSync(f, "utf8");

if (!t.includes("LOCK OF THE DAY · ")) {
  const start = t.indexOf("function buildDefaultLotd");
  if (start >= 0) {
    const end = t.indexOf("\nfunction applyToDesk", start);
    if (end > start) {
      const inject = `function buildDefaultLotd(key, picks) {
  const ranked =
    picks.find((p) => p.potd && !p.final) ||
    picks.find((p) => p.tier === "LOCK" && !p.final) ||
    picks.find((p) => p.tier === "VALUE" && !p.final) ||
    picks.find((p) => p.tier === "LEAN" && !p.final) ||
    picks[0];
  if (!ranked) {
    return {
      date: key, sport: "DESK", event: "Daily", match: "Awaiting slate",
      pick: "Run /daily when games post", market: "—", priceGuide: "—", units: 0,
      tier: "LOCK OF THE DAY",
      analysis: { form: "No games yet", serve: "—", situational: "—", kill: "—", prediction: "Re-run /daily" },
      kalshi: "https://kalshi.com"
    };
  }
  const r = ranked.reasoning || {};
  return {
    date: key,
    sport: ranked.sport,
    event: ranked.sport + " · daily desk",
    match: ranked.game,
    pick: "👑 LOCK OF THE DAY · " + ranked.selection,
    market: ranked.type || "ml",
    priceGuide: ranked.price,
    units: Math.max(ranked.units || 0.25, 0.25),
    tier: "LOCK OF THE DAY",
    analysis: {
      form: r.form || ranked.why,
      serve: r.number || ranked.price,
      situational: r.situational || ranked.game,
      kill: r.kill || "Bad number · injury",
      prediction: r.decision || ("✅ TAKE " + ranked.selection)
    },
    kalshi: "https://kalshi.com"
  };
}

`;
      t = t.slice(0, start) + inject + t.slice(end);
      console.log("Patched buildDefaultLotd → clear LOCK OF THE DAY");
    }
  }
}

if (!t.includes("Stamp every category") && !t.includes("cat.best.pick = \"✅ TAKE\"")) {
  t = t.replace(
    "if (desk.lockOfTheDay && card.lockOfTheDay) {\n      Object.assign(desk.lockOfTheDay, card.lockOfTheDay);\n    }",
    `if (desk.lockOfTheDay && card.lockOfTheDay) {
      Object.assign(desk.lockOfTheDay, card.lockOfTheDay);
    }
    if (desk.categories && card.picks?.length) {
      for (const [key, cat] of Object.entries(desk.categories)) {
        const sport = (cat.label || key).toUpperCase();
        const match =
          card.picks.find((p) => p.sport === sport && (p.tier === "LOCK" || p.potd)) ||
          card.picks.find((p) => p.sport === sport && (p.tier === "VALUE" || p.tier === "LEAN")) ||
          card.picks.find((p) => p.sport === sport);
        if (match && cat.best) {
          cat.best.pick = "✅ TAKE " + match.selection;
          cat.best.odds = match.price;
          cat.best.size = (match.units || 0.25) + "u";
          cat.best.why = match.why || "Process take";
          cat.locks = [{
            tier: match.potd ? "LOCK OF THE DAY" : match.tier,
            pick: "✅ TAKE " + match.selection,
            odds: match.price,
            size: (match.units || 0.25) + "u",
            note: match.reasoning?.decision || match.why
          }];
        }
      }
    }`
  );
  console.log("Patched category TAKE stamps");
}

fs.writeFileSync(f, t);
console.log("overlay_takes_patch done");
