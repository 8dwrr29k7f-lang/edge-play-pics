import fs from "fs";
import path from "path";

const indexPath = path.join("src", "index.js");
const copies = [
  ["registerOnBoot.js", path.join("src", "registerOnBoot.js")],
  ["overlay_lotdEmbed.js", path.join("src", "lotdEmbed.js")],
  ["overlay_desk.js", path.join("src", "data", "desk.js")]
];
for (const [src, dest] of copies) {
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log("Overlay:", src);
  }
}
if (!fs.existsSync(indexPath)) process.exit(0);
let t = fs.readFileSync(indexPath, "utf8");

if (!t.includes("registerCommandsOnBoot") && t.includes('from "./dailyRoll.js"')) {
  t = t.replace(
    'import { rollDailyCard, ensureTodayCard } from "./dailyRoll.js";',
    'import { rollDailyCard, ensureTodayCard } from "./dailyRoll.js";\nimport { registerCommandsOnBoot } from "./registerOnBoot.js";'
  );
  t = t.replace("client.once(Events.ClientReady, (c) => {", "client.once(Events.ClientReady, async (c) => {");
  t = t.replace(
    "console.log(`👑 EDGE PLAY PICS online as ${c.user.tag}`);",
    "console.log(`👑 EDGE PLAY PICS online as ${c.user.tag}`);\n  await registerCommandsOnBoot();"
  );
  console.log("Patched auto-register");
}

if (!t.includes("valueBoardEmbed")) {
  t = t.replace(
    'import { lotdEmbed, liveCardEmbed, locksTodayEmbed } from "./lotdEmbed.js";',
    'import { lotdEmbed, liveCardEmbed, locksTodayEmbed, valueBoardEmbed, propsEmbed, parlaysEmbed } from "./lotdEmbed.js";'
  );
  console.log("Patched value/props imports");
}

if (!t.includes('name === "lotd"')) {
  const needle = `if (name === "hold") {\n      await interaction.reply({ embeds: [holdEmbed()] });\n      return;\n    }`;
  const insert = needle + `\n    if (name === "lotd" || name === "lock") {\n      await interaction.deferReply();\n      try { await ensureTodayCard(); } catch {}\n      await interaction.editReply({ embeds: [lotdEmbed(), locksTodayEmbed()] });\n      return;\n    }\n    if (name === "live") {\n      await interaction.reply({ embeds: [liveCardEmbed(), locksTodayEmbed()] });\n      return;\n    }\n    if (name === "hedge" || name === "cashout") {\n      await interaction.reply({ embeds: [hedgesEmbed()] });\n      return;\n    }`;
  if (t.includes(`if (name === "hold")`)) {
    t = t.replace(needle, insert);
    console.log("Patched lotd/live");
  }
}

if (!t.includes('name === "value"') && t.includes('name === "media"')) {
  t = t.replace(
    `if (name === "media" || name === "follow") {\n      await interaction.deferReply();\n      await interaction.editReply({ embeds: [await mediaFollowEmbed()] });\n      return;\n    }`,
    `if (name === "media" || name === "follow") {\n      await interaction.deferReply();\n      await interaction.editReply({ embeds: [await mediaFollowEmbed()] });\n      return;\n    }\n    if (name === "value") {\n      await interaction.reply({ embeds: [valueBoardEmbed()] });\n      return;\n    }\n    if (name === "props" || name === "prop") {\n      await interaction.reply({ embeds: [propsEmbed()] });\n      return;\n    }\n    if (name === "parlay" || name === "parlays") {\n      await interaction.reply({ embeds: [parlaysEmbed()] });\n      return;\n    }`
  );
  console.log("Patched value/props/parlay commands");
}

fs.writeFileSync(indexPath, t);
console.log("patch-register done");
