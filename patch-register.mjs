/** Patch unpacked src/index.js to auto-register slash commands on boot */
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
if (t.includes("registerCommandsOnBoot")) {
  console.log("index.js already has auto-register");
  process.exit(0);
}

if (!t.includes('from "./dailyRoll.js"')) {
  console.warn("patch-register: unexpected index.js shape");
  process.exit(0);
}

t = t.replace(
  'import { rollDailyCard, ensureTodayCard } from "./dailyRoll.js";',
  'import { rollDailyCard, ensureTodayCard } from "./dailyRoll.js";\nimport { registerCommandsOnBoot } from "./registerOnBoot.js";'
);

t = t.replace(
  "client.once(Events.ClientReady, (c) => {",
  "client.once(Events.ClientReady, async (c) => {"
);

t = t.replace(
  "console.log(`👑 EDGE PLAY PICS online as ${c.user.tag}`);",
  "console.log(`👑 EDGE PLAY PICS online as ${c.user.tag}`);\n  await registerCommandsOnBoot();"
);

fs.writeFileSync(indexPath, t);
console.log("Patched index.js for auto slash register");
