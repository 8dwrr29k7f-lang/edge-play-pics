import fs from "fs";
import path from "path";

const indexPath = path.join("src", "index.js");
const copies = [
  ["registerOnBoot.js", path.join("src", "registerOnBoot.js")],
  ["overlay_lotdEmbed.js", path.join("src", "lotdEmbed.js")],
  ["overlay_desk.js", path.join("src", "data", "desk.js")],
  ["overlay_mediaFollow.js", path.join("src", "mediaFollow.js")],
  ["overlay_dailyRoll.js", path.join("src", "dailyRoll.js")],
  ["overlay_categoryEmbed.js", path.join("src", "categoryEmbed.js")],
  ["overlay_analyticsEngine.js", path.join("src", "analyticsEngine.js")],
  ["overlay_liveEmbeds.js", path.join("src", "liveEmbeds.js")],
  ["overlay_pickFormat.js", path.join("src", "pickFormat.js")]
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
}
fs.writeFileSync(indexPath, t);
console.log("patch-register done");
