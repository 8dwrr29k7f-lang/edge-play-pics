/** Force daily LOCK + force /locks /best to desk (not OpticOdds-only) */
import fs from "fs";
import path from "path";

const f = path.join("src", "dailyRoll.js");
if (fs.existsSync(f)) {
  let t = fs.readFileSync(f, "utf8");
  if (!t.includes("LOCK OF THE DAY · ") && t.includes("function buildDefaultLotd")) {
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
    date: key, sport: ranked.sport, event: ranked.sport + " · desk",
    match: ranked.game,
    pick: "👑 LOCK OF THE DAY · " + ranked.selection,
    market: ranked.type || "ml", priceGuide: ranked.price,
    units: Math.max(ranked.units || 0.5, 0.5),
    tier: "LOCK OF THE DAY",
    analysis: {
      form: r.form || ranked.why,
      serve: r.number || ranked.price,
      situational: r.situational || ranked.game,
      kill: r.kill || "Injury · bad number",
      prediction: r.decision || ("✅ TAKE " + ranked.selection)
    },
    kalshi: "https://kalshi.com"
  };
}

` +
        t.slice(end);
      fs.writeFileSync(f, t);
      console.log("Patched buildDefaultLotd");
    }
  }
}

const idxPath = path.join("src", "index.js");
if (fs.existsSync(idxPath)) {
  let ix = fs.readFileSync(idxPath, "utf8");
  let changed = false;
  if (ix.includes('name === "locks"')) {
    const re = /if \(name === "locks"\) \{[\s\S]*?return;\n    \}/;
    const rep = `if (name === "locks") {
      await interaction.deferReply();
      try { await ensureTodayCard(); } catch {}
      await interaction.editReply({ embeds: [locksTodayEmbed()] });
      return;
    }`;
    if (re.test(ix)) {
      ix = ix.replace(re, rep);
      changed = true;
      console.log("Forced /locks → desk locksTodayEmbed");
    }
  }
  if (ix.includes('name === "best"')) {
    const re = /if \(name === "best"\) \{[\s\S]*?return;\n    \}/;
    const rep = `if (name === "best") {
      await interaction.deferReply();
      try { await ensureTodayCard(); } catch {}
      await interaction.editReply({ embeds: [lotdEmbed(), locksTodayEmbed()] });
      return;
    }`;
    if (re.test(ix)) {
      ix = ix.replace(re, rep);
      changed = true;
      console.log("Forced /best → lotd + desk locks");
    }
  }
  if (changed) fs.writeFileSync(idxPath, ix);
}

console.log("overlay_takes_patch done — desk locks forced");
