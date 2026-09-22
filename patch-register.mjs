/** Hotfix after unpack: commands + /lotd /live /locks with analysis */
import fs from "fs";
import path from "path";

const indexPath = path.join("src", "index.js");

const copies = [
  ["registerOnBoot.js", path.join("src", "registerOnBoot.js")],
  ["overlay_lotdEmbed.js", path.join("src", "lotdEmbed.js")]
];
for (const [src, dest] of copies) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log("Overlay:", src, "→", dest);
  }
}

if (!fs.existsSync(indexPath)) {
  console.warn("patch-register: no src/index.js");
  process.exit(0);
}

let t = fs.readFileSync(indexPath, "utf8");

if (!t.includes("registerCommandsOnBoot")) {
  if (t.includes('from "./dailyRoll.js"')) {
    t = t.replace(
      'import { rollDailyCard, ensureTodayCard } from "./dailyRoll.js";',
      'import { rollDailyCard, ensureTodayCard } from "./dailyRoll.js";\nimport { registerCommandsOnBoot } from "./registerOnBoot.js";'
    );
  }
  t = t.replace(
    "client.once(Events.ClientReady, (c) => {",
    "client.once(Events.ClientReady, async (c) => {"
  );
  t = t.replace(
    "console.log(`👑 EDGE PLAY PICS online as ${c.user.tag}`);",
    "console.log(`👑 EDGE PLAY PICS online as ${c.user.tag}`);\n  await registerCommandsOnBoot();"
  );
  console.log("Patched auto-register");
}

if (!t.includes('name === "lotd"')) {
  const needle = `if (name === "hold") {
      await interaction.reply({ embeds: [holdEmbed()] });
      return;
    }`;
  const insert = `if (name === "hold") {
      await interaction.reply({ embeds: [holdEmbed()] });
      return;
    }
    if (name === "lotd" || name === "lock") {
      await interaction.deferReply();
      try { await ensureTodayCard(); } catch {}
      await interaction.editReply({ embeds: [lotdEmbed(), locksTodayEmbed()] });
      return;
    }
    if (name === "live") {
      await interaction.reply({ embeds: [liveCardEmbed(), locksTodayEmbed()] });
      return;
    }
    if (name === "hedge" || name === "cashout") {
      await interaction.reply({ embeds: [hedgesEmbed()] });
      return;
    }`;
  if (t.includes(needle)) {
    t = t.replace(needle, insert);
    console.log("Patched /lotd /live handlers");
  }
}

if (t.includes("liveLocksEmbed()") && t.includes('name === "locks"') && !t.includes("locksTodayEmbed()")) {
  t = t.replace(
    `if (name === "locks") {
      await interaction.deferReply();
      await interaction.editReply({ embeds: [await liveLocksEmbed()] });
      return;
    }`,
    `if (name === "locks") {
      await interaction.deferReply();
      const embeds = [locksTodayEmbed()];
      try { const live = await liveLocksEmbed(); if (live) embeds.push(live); } catch {}
      await interaction.editReply({ embeds });
      return;
    }`
  );
  console.log("Patched /locks analysis board");
}

fs.writeFileSync(indexPath, t);
console.log("patch-register done");
