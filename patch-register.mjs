/** Patch unpacked bot: auto-register commands + ensure /lotd /live /lock handlers */
import fs from "fs";
import path from "path";

const indexPath = path.join("src", "index.js");
const bootSrc = "registerOnBoot.js";
const bootDest = path.join("src", "registerOnBoot.js");

if (fs.existsSync(bootSrc)) {
  fs.copyFileSync(bootSrc, bootDest);
  console.log("Copied registerOnBoot.js into src/");
}

if (!fs.existsSync(indexPath)) {
  console.warn("patch-register: no src/index.js");
  process.exit(0);
}

let t = fs.readFileSync(indexPath, "utf8");

// 1) Auto-register on boot
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

// 2) Ensure /lotd /lock /live /hedge handlers exist
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
      await interaction.reply({ embeds: [lotdEmbed()] });
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
    console.log("Patched /lotd /live /lock /hedge handlers");
  } else {
    console.warn("Could not find hold handler to patch lotd");
  }
} else {
  console.log("/lotd handler already present");
}

fs.writeFileSync(indexPath, t);
console.log("patch-register done");
