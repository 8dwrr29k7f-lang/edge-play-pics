/** Ensure dailyRoll.js always exports rollDailyCard + ensureTodayCard */
import fs from "fs";
import path from "path";

const f = path.join("src", "dailyRoll.js");
if (!fs.existsSync(f)) {
  console.error("export_guard: no dailyRoll.js");
  process.exit(0);
}
let t = fs.readFileSync(f, "utf8");
const hasRoll = /export\s+async\s+function\s+rollDailyCard/.test(t);
const hasEnsure = /export\s+async\s+function\s+ensureTodayCard/.test(t);
const hasGet = /export\s+function\s+getDailyCard/.test(t);

if (hasRoll && hasEnsure) {
  console.log("export_guard: dailyRoll exports already OK");
  process.exit(0);
}

console.log("export_guard: repairing missing exports", { hasRoll, hasEnsure, hasGet });

if (!hasRoll && /async function rollDailyCard/.test(t)) {
  t = t.replace(/async function rollDailyCard/, "export async function rollDailyCard");
}
if (!hasEnsure && /async function ensureTodayCard/.test(t)) {
  t = t.replace(/async function ensureTodayCard/, "export async function ensureTodayCard");
}
if (!hasGet && /function getDailyCard/.test(t)) {
  t = t.replace(/function getDailyCard/, "export function getDailyCard");
}

if (!/export\s+async\s+function\s+rollDailyCard/.test(t)) {
  t += `\n\nexport async function rollDailyCard(opts = {}) {\n  console.warn("rollDailyCard body missing — empty card");\n  return { dateKey: new Date().toISOString().slice(0, 10), picks: [], lockOfTheDay: { pick: "Run /daily after fix" } };\n}\n`;
}
if (!/export\s+async\s+function\s+ensureTodayCard/.test(t)) {
  t += `\nexport async function ensureTodayCard() {\n  return rollDailyCard({ force: true });\n}\n`;
}
if (!/export\s+function\s+getDailyCard/.test(t)) {
  t += `\nexport function getDailyCard() { return null; }\n`;
}

fs.writeFileSync(f, t);
console.log("export_guard: wrote repairs");
