/** Force daily LOCK OF THE DAY from media + stats ranking */
import fs from "fs";
import path from "path";

const f = path.join("src", "dailyRoll.js");
if (!fs.existsSync(f)) {
  console.log("no dailyRoll");
  process.exit(0);
}
let t = fs.readFileSync(f, "utf8");

const FORCE_FN = `
function forcePromoteFromMediaStats(picks) {
  if (!picks?.length) return picks;
  const mediaBias = {
    NFL: "Media/TV sides often taxed — shop soft process side",
    MLB: "Ace narratives tax past 65¢ — VALUE 40–65¢ SP only",
    NBA: "Star props need lineup; lean rest edge",
    TENNIS: "IG/TG spam — need form+serve",
    SOCCER: "Badge chalk PASS 1.15–1.30"
  };
  const score = (p) => {
    let s = 0;
    if (p.potd) s += 50;
    if (p.tier === "LOCK") s += 40;
    if (p.tier === "VALUE") s += 30;
    if (p.tier === "LEAN") s += 20;
    if (p.sport === "NFL") s += 8;
    if (p.sport === "MLB") s += 6;
    if (p.units > 0) s += 5;
    if (p.final) s -= 100;
    if (/Wait next|Empty board|No NFL|No MLB/i.test(p.game || "")) s -= 50;
    return s;
  };
  const ranked = [...picks].sort((a, b) => score(b) - score(a));
  const top = ranked.find((p) => score(p) > 0) || ranked[0];
  if (!top) return picks;
  top.tier = "LOCK";
  top.potd = true;
  top.units = Math.max(top.units || 0.25, 0.5);
  top.why = "🔒 LOCK OF THE DAY · ✅ TAKE " + top.selection + " · media+stats rank";
  top.reasoning = top.reasoning || {};
  top.reasoning.media = mediaBias[top.sport] || "See /media — desk sizes units";
  top.reasoning.decision = "🔒 ✅ TAKE " + top.selection + " · " + top.units + "u · " + top.price;
  top.reasoning.form = top.reasoning.form || "Ranked #1 on daily slate (ESPN + media maps).";
  top.reasoning.kill = top.reasoning.kill || "Injury · line move · media steam without price";
  for (const p of ranked.slice(1, 4)) {
    if (p.final || score(p) < 10) continue;
    if (p.tier === "HOLD" || p.tier === "PASS") {
      p.tier = "VALUE";
      p.units = Math.max(p.units || 0, 0.35);
      p.why = "💎 VALUE · ✅ TAKE " + p.selection + " if price hits";
      p.reasoning = p.reasoning || {};
      p.reasoning.decision = "💎 ✅ TAKE " + p.selection + " · " + p.units + "u";
      p.reasoning.media = mediaBias[p.sport] || "Cross-check /media";
    }
  }
  return picks;
}
`;

if (!t.includes("forcePromoteFromMediaStats")) {
  const anchor = t.indexOf("function processPickFromGame");
  if (anchor > 0) {
    t = t.slice(0, anchor) + FORCE_FN + "\n" + t.slice(anchor);
    console.log("Inserted forcePromoteFromMediaStats");
  }
}

if (t.includes("const picks = games.map(processPickFromGame)") && !t.includes("let picks = games.map")) {
  t = t.replace(
    "const picks = games.map(processPickFromGame);",
    "let picks = games.map(processPickFromGame);\n  picks = forcePromoteFromMediaStats(picks);"
  );
  console.log("Force call after map");
}
if (t.includes("const lockOfDay = buildDefaultLotd") && !t.includes("forcePromoteFromMediaStats(picks);\n  const lockOfDay")) {
  t = t.replace(
    "const lockOfDay = buildDefaultLotd(key, picks);",
    "picks = forcePromoteFromMediaStats(picks);\n  const lockOfDay = buildDefaultLotd(key, picks);"
  );
  console.log("Force call before LOTD");
}

if (!t.includes("LOCK OF THE DAY · ")) {
  const start = t.indexOf("function buildDefaultLotd");
  const end = t.indexOf("\nfunction applyToDesk", start);
  if (start >= 0 && end > start) {
    t =
      t.slice(0, start) +
      `function buildDefaultLotd(key, picks) {
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
      analysis: { form: "No games", serve: "—", situational: "—", kill: "—", prediction: "Re-run /daily" },
      kalshi: "https://kalshi.com"
    };
  }
  const r = ranked.reasoning || {};
  return {
    date: key,
    sport: ranked.sport,
    event: ranked.sport + " · media+stats desk",
    match: ranked.game,
    pick: "👑 LOCK OF THE DAY · " + ranked.selection,
    market: ranked.type || "ml",
    priceGuide: ranked.price,
    units: Math.max(ranked.units || 0.5, 0.5),
    tier: "LOCK OF THE DAY",
    analysis: {
      form: r.form || ranked.why,
      serve: r.number || ranked.price,
      situational: r.situational || ranked.game,
      kill: r.kill || "Injury · bad number",
      prediction: r.decision || ("✅ TAKE " + ranked.selection),
      media: r.media || "Media via /media — desk sizes the bet"
    },
    kalshi: "https://kalshi.com"
  };
}

` +
      t.slice(end);
    console.log("Patched buildDefaultLotd");
  }
}

fs.writeFileSync(f, t);
console.log("overlay_takes_patch done — daily LOCK forced");
